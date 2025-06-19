// src/app/dashboard/components/market-watch/market-watch.component.ts
import { CommonModule } from '@angular/common';
import {
  Component,
  HostListener,
  OnInit,
  OnDestroy,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import {
  takeUntil,
  debounceTime,
  distinctUntilChanged,
  catchError,
} from 'rxjs/operators';
import {
  TradingPairsService,
  TradingPair,
  TickerData,
} from '../../../core/services/trading-pairs.service';
import {
  SignalRService,
  WebSocketTickerData,
} from '../../../core/services/signalr.service';

interface TradingPairDisplay extends TradingPair {
  displayName: string;
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  isLoading: boolean;
}

@Component({
  selector: 'app-market-watch',
  imports: [CommonModule, FormsModule],
  templateUrl: './market-watch.component.html',
  styleUrl: './market-watch.component.scss',
})
export class MarketWatchComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly tradingPairsService = inject(TradingPairsService);
  public readonly signalRService = inject(SignalRService); // Made public for template access

  // Component state
  selectedPair: TradingPairDisplay | null = null;
  tradingPairs: TradingPairDisplay[] = [];
  filteredPairs: TradingPairDisplay[] = [];
  showPairSelector = false;
  searchTerm = '';
  isLoading = false;
  error: string | null = null;

  // Market data
  dailyHigh = 0;
  dailyLow = 0;
  dailyVolume = 0;

  // Search subject for debouncing
  private readonly searchSubject = new Subject<string>();

  ngOnInit(): void {
    this.initializeComponent();
    this.setupSearchDebouncing();
    this.loadTradingPairs();
    this.connectToSignalR();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeComponent(): void {
    // Listen for selected pair changes
    this.tradingPairsService.selectedPair$
      .pipe(takeUntil(this.destroy$))
      .subscribe((pair) => {
        if (pair) {
          this.updateSelectedPair(pair);
        }
      });

    // Listen for loading state changes
    this.tradingPairsService.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe((loading) => {
        this.isLoading = loading;
      });

    // Listen for errors
    this.tradingPairsService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe((error) => {
        this.error = error;
      });
  }

  private setupSearchDebouncing(): void {
    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((searchTerm) => {
        this.performSearch(searchTerm);
      });
  }

  private loadTradingPairs(): void {
    this.tradingPairsService
      .fetchTradingPairs()
      .pipe(
        takeUntil(this.destroy$),
        catchError((error) => {
          console.error('Failed to load trading pairs:', error);
          this.error = 'Failed to load trading pairs. Please try again.';
          return [];
        })
      )
      .subscribe((pairs) => {
        this.tradingPairs = pairs.map((pair) =>
          this.createTradingPairDisplay(pair)
        );
        this.filteredPairs = [...this.tradingPairs];
        this.loadInitialMarketData();
      });
  }

  private createTradingPairDisplay(pair: TradingPair): TradingPairDisplay {
    return {
      ...pair,
      displayName: this.formatDisplayName(pair),
      currentPrice: 0,
      priceChange: 0,
      priceChangePercent: 0,
      volume24h: 0,
      high24h: 0,
      low24h: 0,
      isLoading: true,
    };
  }

  private formatDisplayName(pair: TradingPair): string {
    if (pair.quoteAsset && pair.baseAsset) {
      return `${pair.baseAsset}/${pair.quoteAsset}`;
    }
    return pair.symbol;
  }

  private async connectToSignalR(): Promise<void> {
    try {
      await this.signalRService.connect();
      console.log('Connected to SignalR hub');
    } catch (error) {
      console.error('Failed to connect to SignalR:', error);
      this.error =
        'Failed to connect to real-time data. Some features may be limited.';
    }
  }

  private loadInitialMarketData(): void {
    const popularPairs = this.tradingPairs.slice(0, 10);

    popularPairs.forEach((pair) => {
      this.loadTickerData(pair.symbol);
    });
  }

  private loadTickerData(symbol: string): void {
    this.tradingPairsService
      .getTickerData(symbol)
      .pipe(
        takeUntil(this.destroy$),
        catchError((error) => {
          console.error(`Failed to load ticker data for ${symbol}:`, error);
          return [];
        })
      )
      .subscribe((tickerData) => {
        if (tickerData) {
          this.updatePairWithTickerData(symbol, tickerData);
        }
      });
  }

  private updatePairWithTickerData(
    symbol: string,
    tickerData: TickerData
  ): void {
    const pairIndex = this.tradingPairs.findIndex((p) => p.symbol === symbol);
    if (pairIndex !== -1) {
      this.tradingPairs[pairIndex] = {
        ...this.tradingPairs[pairIndex],
        currentPrice: tickerData.lastPrice,
        priceChange: tickerData.priceChange,
        priceChangePercent: tickerData.priceChangePercent,
        volume24h: tickerData.volume,
        high24h: tickerData.highPrice,
        low24h: tickerData.lowPrice,
        isLoading: false,
      };

      const filteredIndex = this.filteredPairs.findIndex(
        (p) => p.symbol === symbol
      );
      if (filteredIndex !== -1) {
        this.filteredPairs[filteredIndex] = this.tradingPairs[pairIndex];
      }

      if (this.selectedPair && this.selectedPair.symbol === symbol) {
        this.selectedPair = this.tradingPairs[pairIndex];
        this.updateDailyStats();
      }
    }
  }

  private updateSelectedPair(pair: TradingPair): void {
    const existingPair = this.tradingPairs.find(
      (p) => p.symbol === pair.symbol
    );
    if (existingPair) {
      this.selectedPair = existingPair;
    } else {
      this.selectedPair = this.createTradingPairDisplay(pair);
      this.loadTickerData(pair.symbol);
    }

    this.updateDailyStats();
    this.subscribeToRealTimeData(pair.symbol);
  }

  private updateDailyStats(): void {
    if (this.selectedPair) {
      this.dailyHigh = this.selectedPair.high24h;
      this.dailyLow = this.selectedPair.low24h;
      this.dailyVolume = this.selectedPair.volume24h;
    }
  }

  private async subscribeToRealTimeData(symbol: string): Promise<void> {
    try {
      if (this.selectedPair && this.selectedPair.symbol !== symbol) {
        await this.signalRService.unsubscribeFromTicker(
          this.selectedPair.symbol
        );
      }

      await this.signalRService.subscribeToTicker(symbol);

      this.signalRService
        .getTickerDataForSymbol(symbol)
        .pipe(takeUntil(this.destroy$))
        .subscribe((tickerData) => {
          this.updatePairWithRealTimeData(symbol, tickerData);
        });
    } catch (error) {
      console.error(
        `Failed to subscribe to real-time data for ${symbol}:`,
        error
      );
    }
  }

  private updatePairWithRealTimeData(
    symbol: string,
    tickerData: WebSocketTickerData
  ): void {
    const pairIndex = this.tradingPairs.findIndex((p) => p.symbol === symbol);
    if (pairIndex !== -1) {
      this.tradingPairs[pairIndex] = {
        ...this.tradingPairs[pairIndex],
        currentPrice: tickerData.lastPrice,
        priceChange: tickerData.priceChange,
        priceChangePercent: tickerData.priceChangePercent,
        volume24h: tickerData.totalTradedBaseAssetVolume,
        high24h: tickerData.highPrice,
        low24h: tickerData.lowPrice,
        isLoading: false,
      };

      const filteredIndex = this.filteredPairs.findIndex(
        (p) => p.symbol === symbol
      );
      if (filteredIndex !== -1) {
        this.filteredPairs[filteredIndex] = this.tradingPairs[pairIndex];
      }

      if (this.selectedPair && this.selectedPair.symbol === symbol) {
        this.selectedPair = this.tradingPairs[pairIndex];
        this.updateDailyStats();
      }
    }
  }

  private performSearch(searchTerm: string): void {
    if (!searchTerm.trim()) {
      this.filteredPairs = [...this.tradingPairs];
      return;
    }

    const searchLower = searchTerm.toLowerCase();
    this.filteredPairs = this.tradingPairs.filter(
      (pair) =>
        pair.symbol.toLowerCase().includes(searchLower) ||
        pair.baseAsset.toLowerCase().includes(searchLower) ||
        pair.quoteAsset.toLowerCase().includes(searchLower) ||
        pair.displayName.toLowerCase().includes(searchLower)
    );
  }

  public trackBySymbol(index: number, pair: TradingPairDisplay): string {
    return pair.symbol;
  }

  public onSearchChange(searchTerm: string): void {
    this.searchTerm = searchTerm;
    this.searchSubject.next(searchTerm);
  }

  public selectTradingPair(pair: TradingPairDisplay): void {
    this.tradingPairsService.setSelectedPair(pair);
    this.showPairSelector = false;
    this.searchTerm = '';
  }

  public togglePairSelector(): void {
    this.showPairSelector = !this.showPairSelector;
    if (!this.showPairSelector) {
      this.searchTerm = '';
      this.filteredPairs = [...this.tradingPairs];
    }
  }

  public refreshData(): void {
    this.error = null;
    this.tradingPairsService
      .refreshTradingPairs()
      .pipe(takeUntil(this.destroy$))
      .subscribe();
  }

  public formatPrice(price: number): string {
    if (price >= 1) {
      return price.toFixed(2);
    } else if (price >= 0.01) {
      return price.toFixed(4);
    } else {
      return price.toFixed(6);
    }
  }

  public formatVolume(volume: number): string {
    if (volume >= 1000000) {
      return (volume / 1000000).toFixed(1) + 'M';
    } else if (volume >= 1000) {
      return (volume / 1000).toFixed(1) + 'K';
    }
    return volume.toFixed(0);
  }

  public getPriceChangeClass(change: number): string {
    return change >= 0 ? 'text-green-400' : 'text-red-400';
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.pair-selector-container')) {
      this.showPairSelector = false;
      this.searchTerm = '';
      this.filteredPairs = [...this.tradingPairs];
    }
  }
}
