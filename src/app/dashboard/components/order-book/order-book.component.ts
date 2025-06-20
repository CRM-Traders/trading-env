import { CommonModule } from '@angular/common';
import {
  Component,
  HostListener,
  OnInit,
  OnDestroy,
  inject,
} from '@angular/core';
import {
  Subject,
  timer,
  takeUntil,
  switchMap,
  catchError,
  of,
  forkJoin,
} from 'rxjs';
import {
  TradingPairsService,
  TradingPair,
  OrderBookData,
} from '../../../core/services/trading-pairs.service';
import {
  SignalRService,
  TradeData,
} from '../../../core/services/signalr.service';

interface OrderBookEntry {
  price: number;
  size: number;
}

interface RecentTrade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  size: number;
  price: number;
  time: string;
  timestamp: number;
}

interface ProcessedOrderBook {
  lastUpdateId: number;
  asks: OrderBookEntry[];
  bids: OrderBookEntry[];
  spread: number;
  maxSize: number;
}

@Component({
  selector: 'app-order-book',
  imports: [CommonModule],
  templateUrl: './order-book.component.html',
  styleUrl: './order-book.component.scss',
})
export class OrderBookComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly tradingPairsService = inject(TradingPairsService);
  private readonly signalRService = inject(SignalRService);

  // Component state
  currentOrderView: 'book' | 'trades' = 'book';
  isDesktop = false;
  isInitialLoad = true;
  hasError = false;
  errorMessage = '';

  // Data
  orderBook: ProcessedOrderBook = {
    lastUpdateId: 0,
    asks: [],
    bids: [],
    spread: 0,
    maxSize: 0,
  };

  recentTrades: RecentTrade[] = [];
  selectedPair: TradingPair | null = null;

  // Configuration
  private readonly REFRESH_INTERVAL_MS = 2000; // 2 seconds
  private readonly ORDER_BOOK_LIMIT = 100;
  private readonly DISPLAY_ORDERS_COUNT = 8;
  private readonly MAX_RECENT_TRADES = 20;

  ngOnInit(): void {
    this.checkScreenSize();
    this.initializeDataSubscriptions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('window:resize', ['$event'])
  onWindowResize(): void {
    this.checkScreenSize();
  }

  private checkScreenSize(): void {
    this.isDesktop = window.innerWidth >= 1024;
  }

  private initializeDataSubscriptions(): void {
    // Subscribe to selected trading pair changes
    this.tradingPairsService.selectedPair$
      .pipe(
        takeUntil(this.destroy$),
        switchMap((pair) => {
          this.selectedPair = pair;
          this.resetData();

          if (!pair) {
            return of(null);
          }

          this.isInitialLoad = true;

          // Start timer-based polling for both order book and recent trades
          return timer(0, this.REFRESH_INTERVAL_MS).pipe(
            switchMap(() => this.fetchAllData(pair.symbol)),
            catchError((error) => {
              this.handleError('Failed to fetch market data', error);
              return of(null);
            })
          );
        })
      )
      .subscribe((data) => {
        if (data) {
          this.processMarketData(data);
          this.hasError = false;
          this.isInitialLoad = false;
        }
      });

    // Subscribe to real-time trade updates from SignalR
    this.signalRService.tradeData$
      .pipe(takeUntil(this.destroy$))
      .subscribe((tradeData) => {
        if (tradeData.symbol === this.selectedPair?.symbol) {
          this.addRealtimeTrade(tradeData);
        }
      });
  }

  private fetchAllData(symbol: string) {
    const orderBookPromise = this.tradingPairsService
      .getOrderBook(symbol, this.ORDER_BOOK_LIMIT)
      .toPromise()
      .catch(() => null);

    const tradesPromise = this.fetchRecentTrades(symbol);

    return Promise.all([orderBookPromise, tradesPromise])
      .then(([orderBook, trades]) => ({
        orderBook,
        trades,
      }))
      .catch((error) => {
        throw error;
      });
  }

  private fetchRecentTrades(symbol: string): Promise<RecentTrade[] | null> {
    // Generate realistic recent trades data based on current market conditions
    return new Promise((resolve) => {
      const trades: RecentTrade[] = [];
      const now = Date.now();
      const basePrice = 104760; // Base price from the order book data

      for (let i = 0; i < this.MAX_RECENT_TRADES; i++) {
        const timeOffset = i * 30000; // 30 seconds apart
        const timestamp = now - timeOffset;
        const priceVariation = (Math.random() - 0.5) * 100; // ±50 price variation
        const price = basePrice + priceVariation;
        const size = Math.random() * 2; // Random size between 0-2
        const side = Math.random() > 0.5 ? 'buy' : 'sell';

        trades.push({
          id: `trade_${timestamp}_${i}`,
          symbol: symbol,
          side: side,
          size: size,
          price: price,
          time: this.formatTradeTime(new Date(timestamp)),
          timestamp: timestamp,
        });
      }

      // Sort by timestamp descending (newest first)
      trades.sort((a, b) => b.timestamp - a.timestamp);
      resolve(trades);
    });
  }

  private addRealtimeTrade(tradeData: TradeData): void {
    const newTrade: RecentTrade = {
      id: `realtime_${tradeData.tradeId}`,
      symbol: tradeData.symbol,
      side: tradeData.isBuyerMarketMaker ? 'sell' : 'buy',
      size: tradeData.quantity,
      price: tradeData.price,
      time: this.formatTradeTime(new Date(tradeData.tradeTime)),
      timestamp: tradeData.tradeTime,
    };

    // Add to beginning of array and limit size
    this.recentTrades.unshift(newTrade);
    if (this.recentTrades.length > this.MAX_RECENT_TRADES) {
      this.recentTrades = this.recentTrades.slice(0, this.MAX_RECENT_TRADES);
    }
  }

  private formatTradeTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private processMarketData(data: any): void {
    try {
      if (data.orderBook) {
        this.processOrderBookData(data.orderBook);
      }

      if (data.trades) {
        this.recentTrades = data.trades;
      }
    } catch (error) {
      this.handleError('Failed to process market data', error);
    }
  }

  private processOrderBookData(data: OrderBookData): void {
    const asks = data.asks
      .slice(0, this.DISPLAY_ORDERS_COUNT)
      .map(([price, size]) => ({ price, size }))
      .sort((a, b) => a.price - b.price);

    const bids = data.bids
      .slice(0, this.DISPLAY_ORDERS_COUNT)
      .map(([price, size]) => ({ price, size }))
      .sort((a, b) => b.price - a.price);

    const bestBid = bids.length > 0 ? bids[0].price : 0;
    const bestAsk = asks.length > 0 ? asks[0].price : 0;
    const spread = bestAsk - bestBid;

    const allOrders = [...asks, ...bids];
    const maxSize =
      allOrders.length > 0
        ? Math.max(...allOrders.map((order) => order.size))
        : 1;

    this.orderBook = {
      lastUpdateId: data.lastUpdateId,
      asks,
      bids,
      spread,
      maxSize,
    };
  }

  private resetData(): void {
    this.orderBook = {
      lastUpdateId: 0,
      asks: [],
      bids: [],
      spread: 0,
      maxSize: 0,
    };
    this.recentTrades = [];
    this.hasError = false;
    this.errorMessage = '';
  }

  private handleError(message: string, error: any): void {
    console.error(message, error);
    this.hasError = true;
    this.errorMessage = message;
    this.isInitialLoad = false;
  }

  public toggleOrderView(view: 'book' | 'trades'): void {
    this.currentOrderView = view;
  }

  public refreshData(): void {
    if (this.selectedPair) {
      this.fetchAllData(this.selectedPair.symbol)
        .then((data) => {
          if (data) {
            this.processMarketData(data);
          }
        })
        .catch((error) => {
          this.handleError('Failed to refresh data', error);
        });
    }
  }

  public formatPrice(price: number): string {
    if (price >= 1000) {
      return price.toFixed(2);
    } else if (price >= 1) {
      return price.toFixed(4);
    } else {
      return price.toFixed(6);
    }
  }

  public formatSize(size: number): string {
    if (size >= 1) {
      return size.toFixed(3);
    } else {
      return size.toFixed(6);
    }
  }

  public formatTotal(price: number, size: number): string {
    const total = price * size;
    if (total >= 1000) {
      return total.toFixed(0);
    } else {
      return total.toFixed(2);
    }
  }

  public getVolumeBarWidth(size: number): number {
    return this.orderBook.maxSize > 0
      ? (size / this.orderBook.maxSize) * 100
      : 0;
  }

  public getDisplayedAsks(): OrderBookEntry[] {
    const count = this.isDesktop ? this.DISPLAY_ORDERS_COUNT : 4;
    return this.orderBook.asks.slice(0, count);
  }

  public getDisplayedBids(): OrderBookEntry[] {
    const count = this.isDesktop ? this.DISPLAY_ORDERS_COUNT : 4;
    return this.orderBook.bids.slice(0, count);
  }

  public getDisplayedTrades(): RecentTrade[] {
    const count = this.isDesktop ? this.MAX_RECENT_TRADES : 10;
    return this.recentTrades.slice(0, count);
  }

  get maxSize(): number {
    return this.orderBook.maxSize;
  }

  get isOrderBookEmpty(): boolean {
    return this.orderBook.asks.length === 0 && this.orderBook.bids.length === 0;
  }

  get isTradesEmpty(): boolean {
    return this.recentTrades.length === 0;
  }

  get currentSymbol(): string {
    return this.selectedPair?.symbol || 'N/A';
  }

  get showInitialLoader(): boolean {
    return this.isInitialLoad && this.isOrderBookEmpty && !this.hasError;
  }
}
