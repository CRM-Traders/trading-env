// src/app/dashboard/components/market-watch/market-watch.component.ts
import { CommonModule } from '@angular/common';
import {
  Component,
  HostListener,
  OnInit,
  OnDestroy,
  inject,
  ElementRef,
  ViewChild,
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
  @ViewChild('pairDropdownContainer', { static: false })
  private dropdownContainer!: ElementRef;

  private readonly destroy$ = new Subject<void>();
  private readonly tradingPairsService = inject(TradingPairsService);
  public readonly signalRService = inject(SignalRService);

  // Component state
  selectedPair: TradingPairDisplay | null = null;
  tradingPairs: TradingPairDisplay[] = [];
  filteredPairs: TradingPairDisplay[] = [];
  showPairSelector = false;
  searchTerm = '';
  isLoading = false;
  error: string | null = null;

  // Pagination state
  isLoadingMore = false;
  hasMorePairs = true;

  // Market data
  dailyHigh = 0;
  dailyLow = 0;
  dailyVolume = 0;

  // Search subject for debouncing
  private readonly searchSubject = new Subject<string>();
  private searchInProgress = false;

  ngOnInit(): void {
    this.initializeComponent();
    this.setupSearchDebouncing();
    this.loadInitialTradingPairs();
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

    // Listen for trading pairs changes
    this.tradingPairsService.tradingPairs$
      .pipe(takeUntil(this.destroy$))
      .subscribe((pairs) => {
        this.updateTradingPairs(pairs);
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

    // Listen for pagination state changes
    this.tradingPairsService.paginationState$
      .pipe(takeUntil(this.destroy$))
      .subscribe((state) => {
        this.hasMorePairs = state.hasMore;
        this.updateLoadMoreState();
      });
  }

  private updateTradingPairs(pairs: TradingPair[]): void {
    // Convert to display pairs, preserving existing display data where possible
    const displayPairs = pairs.map((pair) => {
      const existingPair = this.tradingPairs.find(
        (p) => p.symbol === pair.symbol
      );
      if (existingPair) {
        // Preserve display data for existing pairs
        return {
          ...pair,
          displayName: this.formatDisplayName(pair),
          currentPrice: existingPair.currentPrice,
          priceChange: existingPair.priceChange,
          priceChangePercent: existingPair.priceChangePercent,
          volume24h: existingPair.volume24h,
          high24h: existingPair.high24h,
          low24h: existingPair.low24h,
          isLoading: existingPair.isLoading,
        };
      } else {
        // Create new display pair
        return this.createTradingPairDisplay(pair);
      }
    });

    this.tradingPairs = displayPairs;

    // Update filtered pairs based on current search
    if (this.searchTerm.trim()) {
      this.applySearchFilter();
    } else {
      this.filteredPairs = [...this.tradingPairs];
    }

    // Load market data for new pairs
    const newPairs = displayPairs.filter(
      (p) =>
        !this.tradingPairs.find((existing) => existing.symbol === p.symbol) &&
        p.isLoading
    );

    if (newPairs.length > 0) {
      // Load market data for first few new pairs to avoid overwhelming the API
      newPairs.slice(0, 5).forEach((pair) => {
        this.loadTickerData(pair.symbol);
      });
    }
  }

  private updateLoadMoreState(): void {
    this.isLoadingMore = this.tradingPairsService.isCurrentlyLoadingMore();
  }

  private setupSearchDebouncing(): void {
    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((searchTerm) => {
        this.performSearch(searchTerm);
      });
  }

  private loadInitialTradingPairs(): void {
    this.tradingPairsService
      .fetchTradingPairs('', 1, 20, false)
      .pipe(
        takeUntil(this.destroy$),
        catchError((error) => {
          console.error('Failed to load trading pairs:', error);
          this.error = 'Failed to load trading pairs. Please try again.';
          return [];
        })
      )
      .subscribe(() => {
        // Data is handled by the tradingPairs$ subscription
        this.loadInitialMarketData();
      });
  }

  private loadMorePairs(): void {
    if (!this.tradingPairsService.canLoadMore() || this.searchInProgress) {
      return;
    }

    this.tradingPairsService
      .loadMoreTradingPairs()
      .pipe(
        takeUntil(this.destroy$),
        catchError((error) => {
          console.error('Failed to load more pairs:', error);
          return [];
        })
      )
      .subscribe(() => {
        // Data is handled by the tradingPairs$ subscription
      });
  }

  private performSearch(searchTerm: string): void {
    if (this.searchInProgress) {
      return;
    }

    this.searchTerm = searchTerm;
    this.searchInProgress = true;

    if (!searchTerm.trim()) {
      // Clear search
      this.tradingPairsService
        .clearSearch()
        .pipe(
          takeUntil(this.destroy$),
          catchError((error) => {
            console.error('Failed to clear search:', error);
            return [];
          })
        )
        .subscribe(() => {
          this.searchInProgress = false;
        });
    } else {
      // Perform search
      this.tradingPairsService
        .searchTradingPairs(searchTerm)
        .pipe(
          takeUntil(this.destroy$),
          catchError((error) => {
            console.error('Failed to search pairs:', error);
            return [];
          })
        )
        .subscribe(() => {
          this.searchInProgress = false;
          this.loadInitialMarketData();
        });
    }
  }

  private applySearchFilter(): void {
    if (!this.searchTerm.trim()) {
      this.filteredPairs = [...this.tradingPairs];
      return;
    }

    const searchLower = this.searchTerm.toLowerCase();
    this.filteredPairs = this.tradingPairs.filter(
      (pair) =>
        pair.symbol.toLowerCase().includes(searchLower) ||
        pair.baseAsset.toLowerCase().includes(searchLower) ||
        pair.quoteAsset.toLowerCase().includes(searchLower)
    );
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
    // Load market data for visible pairs (first 10)
    const visiblePairs = this.filteredPairs.slice(0, 10);
    visiblePairs.forEach((pair) => {
      if (pair.isLoading) {
        this.loadTickerData(pair.symbol);
      }
    });
  }

  private loadTickerData(symbol: string): void {
    this.tradingPairsService
      .getTickerData(symbol)
      .pipe(
        takeUntil(this.destroy$),
        catchError((error) => {
          console.error(`Failed to load ticker data for ${symbol}:`, error);
          this.markPairAsLoaded(symbol);
          return [];
        })
      )
      .subscribe((tickerData) => {
        if (tickerData) {
          this.updatePairWithTickerData(symbol, tickerData);
        }
      });
  }

  private markPairAsLoaded(symbol: string): void {
    this.updatePairProperty(symbol, 'isLoading', false);
  }

  private updatePairProperty(
    symbol: string,
    property: keyof TradingPairDisplay,
    value: any
  ): void {
    // Update in trading pairs array
    const pairIndex = this.tradingPairs.findIndex((p) => p.symbol === symbol);
    if (pairIndex !== -1) {
      this.tradingPairs[pairIndex] = {
        ...this.tradingPairs[pairIndex],
        [property]: value,
      };
    }

    // Update in filtered pairs array
    const filteredIndex = this.filteredPairs.findIndex(
      (p) => p.symbol === symbol
    );
    if (filteredIndex !== -1) {
      this.filteredPairs[filteredIndex] = {
        ...this.filteredPairs[filteredIndex],
        [property]: value,
      };
    }

    // Update selected pair if it matches
    if (this.selectedPair && this.selectedPair.symbol === symbol) {
      this.selectedPair = {
        ...this.selectedPair,
        [property]: value,
      };
    }
  }

  private updatePairWithTickerData(
    symbol: string,
    tickerData: TickerData
  ): void {
    const updates = {
      currentPrice: tickerData.lastPrice,
      priceChange: tickerData.priceChange,
      priceChangePercent: tickerData.priceChangePercent,
      volume24h: tickerData.volume,
      high24h: tickerData.highPrice,
      low24h: tickerData.lowPrice,
      isLoading: false,
    };

    // Apply all updates at once
    Object.entries(updates).forEach(([property, value]) => {
      this.updatePairProperty(
        symbol,
        property as keyof TradingPairDisplay,
        value
      );
    });

    if (this.selectedPair && this.selectedPair.symbol === symbol) {
      this.updateDailyStats();
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
    const updates = {
      currentPrice: tickerData.lastPrice,
      priceChange: tickerData.priceChange,
      priceChangePercent: tickerData.priceChangePercent,
      volume24h: tickerData.totalTradedBaseAssetVolume,
      high24h: tickerData.highPrice,
      low24h: tickerData.lowPrice,
      isLoading: false,
    };

    Object.entries(updates).forEach(([property, value]) => {
      this.updatePairProperty(
        symbol,
        property as keyof TradingPairDisplay,
        value
      );
    });

    if (this.selectedPair && this.selectedPair.symbol === symbol) {
      this.updateDailyStats();
    }
  }

  // Public methods for template

  public onDropdownScroll(event: Event): void {
    const element = event.target as HTMLElement;
    const threshold = 100; // Load more when 100px from bottom

    if (
      element.scrollTop + element.clientHeight >=
        element.scrollHeight - threshold &&
      this.tradingPairsService.canLoadMore() &&
      !this.searchInProgress
    ) {
      this.loadMorePairs();
    }
  }

  public trackBySymbol(index: number, pair: TradingPairDisplay): string {
    return pair.symbol;
  }

  public onSearchChange(searchTerm: string): void {
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
    }
  }

  public refreshData(): void {
    this.error = null;
    this.searchInProgress = false;
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
    }
  }
}
