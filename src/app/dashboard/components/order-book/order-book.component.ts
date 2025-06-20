import { CommonModule } from '@angular/common';
import {
  Component,
  HostListener,
  OnInit,
  OnDestroy,
  inject,
} from '@angular/core';
import { Subject, timer, takeUntil, switchMap, catchError, of } from 'rxjs';
import {
  TradingPairsService,
  TradingPair,
  OrderBookData,
} from '../../../core/services/trading-pairs.service';

interface OrderBookEntry {
  price: number;
  size: number;
}

interface RecentTrade {
  symbol: string;
  side: 'buy' | 'sell';
  size: number;
  price: number;
  time: string;
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

  // Component state
  currentOrderView: 'book' | 'trades' = 'book';
  isDesktop = false;
  isLoading = false;
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

  selectedPair: TradingPair | null = null;

  // Static recent trades data (keeping as mock since no API provided)
  recentTrades: RecentTrade[] = [
    {
      symbol: 'BTCUSD',
      side: 'buy',
      size: 0.25,
      price: 44180.25,
      time: '14:32',
    },
    { symbol: 'ETHUSD', side: 'sell', size: 1.5, price: 2851.4, time: '14:28' },
    { symbol: 'SOLUSD', side: 'buy', size: 5, price: 97.8, time: '14:15' },
    {
      symbol: 'BTCUSD',
      side: 'sell',
      size: 0.1,
      price: 44220.75,
      time: '14:05',
    },
    { symbol: 'ADAUSD', side: 'buy', size: 1000, price: 0.4495, time: '13:58' },
    { symbol: 'ETHUSD', side: 'buy', size: 0.8, price: 2845.3, time: '13:45' },
    {
      symbol: 'BTCUSD',
      side: 'buy',
      size: 0.15,
      price: 44195.8,
      time: '13:30',
    },
  ];

  // Configuration
  private readonly REFRESH_INTERVAL_MS = 2000; // 2 seconds
  private readonly ORDER_BOOK_LIMIT = 100;
  private readonly DISPLAY_ORDERS_COUNT = 8; // Total orders to show (4 asks + 4 bids on mobile, 8 each on desktop)

  ngOnInit(): void {
    this.checkScreenSize();
    this.initializeOrderBookSubscription();
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

  private initializeOrderBookSubscription(): void {
    // Subscribe to selected trading pair changes
    this.tradingPairsService.selectedPair$
      .pipe(
        takeUntil(this.destroy$),
        switchMap((pair) => {
          this.selectedPair = pair;
          this.resetOrderBook();

          if (!pair) {
            return of(null);
          }

          // Start timer-based polling for order book data
          return timer(0, this.REFRESH_INTERVAL_MS).pipe(
            switchMap(() => this.fetchOrderBookData(pair.symbol)),
            catchError((error) => {
              this.handleError('Failed to fetch order book data', error);
              return of(null);
            })
          );
        })
      )
      .subscribe((orderBookData) => {
        if (orderBookData) {
          this.processOrderBookData(orderBookData);
          this.hasError = false;
        }
      });
  }

  private fetchOrderBookData(symbol: string): Promise<OrderBookData | null> {
    this.isLoading = true;

    return this.tradingPairsService
      .getOrderBook(symbol, this.ORDER_BOOK_LIMIT)
      .toPromise()
      .then((data) => {
        this.isLoading = false;
        return data || null;
      })
      .catch((error) => {
        this.isLoading = false;
        throw error;
      });
  }

  private processOrderBookData(data: OrderBookData): void {
    try {
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
    } catch (error) {
      this.handleError('Failed to process order book data', error);
    }
  }

  private resetOrderBook(): void {
    this.orderBook = {
      lastUpdateId: 0,
      asks: [],
      bids: [],
      spread: 0,
      maxSize: 0,
    };
    this.hasError = false;
    this.errorMessage = '';
  }

  private handleError(message: string, error: any): void {
    console.error(message, error);
    this.hasError = true;
    this.errorMessage = message;
    this.isLoading = false;
  }

  public toggleOrderView(view: 'book' | 'trades'): void {
    this.currentOrderView = view;
  }

  public refreshOrderBook(): void {
    if (this.selectedPair) {
      this.fetchOrderBookData(this.selectedPair.symbol)
        .then((data) => {
          if (data) {
            this.processOrderBookData(data);
          }
        })
        .catch((error) => {
          this.handleError('Failed to refresh order book', error);
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

  get maxSize(): number {
    return this.orderBook.maxSize;
  }

  get isOrderBookEmpty(): boolean {
    return this.orderBook.asks.length === 0 && this.orderBook.bids.length === 0;
  }

  get currentSymbol(): string {
    return this.selectedPair?.symbol || 'N/A';
  }
}
