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
  AfterViewInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, BehaviorSubject } from 'rxjs';
import {
  takeUntil,
  debounceTime,
  distinctUntilChanged,
  catchError,
  switchMap,
  tap,
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
export class MarketWatchComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('pairDropdownContainer', { static: false })
  private dropdownContainer!: ElementRef;

  @ViewChild('searchInput', { static: false })
  private searchInput!: ElementRef;

  // Services
  private readonly destroy$ = new Subject<void>();
  private readonly tradingPairsService = inject(TradingPairsService);
  public readonly signalRService = inject(SignalRService);

  // Component state
  selectedPair: TradingPairDisplay | null = null;
  allTradingPairs: TradingPairDisplay[] = [];
  filteredPairs: TradingPairDisplay[] = [];
  showPairSelector = false;
  searchTerm = '';

  // Loading states
  isLoading = false;
  isLoadingMore = false;
  hasMorePairs = true;
  error: string | null = null;

  // Market data
  dailyHigh = 0;
  dailyLow = 0;
  dailyVolume = 0;

  // Search management
  private readonly searchSubject = new Subject<string>();
  private readonly localSearchSubject = new BehaviorSubject<string>('');

  // Market data cache
  private readonly marketDataCache = new Map<string, TickerData>();

  ngOnInit(): void {
    this.initializeSubscriptions();
    this.setupSearchHandling();
    this.initializeTradingPairs();
    this.connectToSignalR();
  }

  ngAfterViewInit(): void {
    // Additional initialization after view is ready
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Initialize all component subscriptions
   */
  private initializeSubscriptions(): void {
    // Subscribe to selected pair changes
    this.tradingPairsService.selectedPair$
      .pipe(takeUntil(this.destroy$))
      .subscribe((pair) => {
        if (pair) {
          this.updateSelectedPair(pair);
        }
      });

    // Subscribe to trading pairs changes
    this.tradingPairsService.tradingPairs$
      .pipe(takeUntil(this.destroy$))
      .subscribe((pairs) => {
        this.updateTradingPairsList(pairs);
      });

    // Subscribe to loading state
    this.tradingPairsService.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe((loading) => {
        this.isLoading = loading;
      });

    // Subscribe to pagination state
    this.tradingPairsService.paginationState$
      .pipe(takeUntil(this.destroy$))
      .subscribe((state) => {
        this.hasMorePairs = state.hasMore;
        this.isLoadingMore = this.tradingPairsService.isCurrentlyLoadingMore();
      });

    // Subscribe to errors
    this.tradingPairsService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe((error) => {
        this.error = error;
      });
  }

  /**
   * Setup search handling with debouncing and local filtering
   */
  private setupSearchHandling(): void {
    // Setup API search debouncing (for initial data loading)
    this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$),
        switchMap((searchTerm) => {
          if (searchTerm.trim()) {
            return this.tradingPairsService.searchTradingPairs(searchTerm);
          } else {
            return this.tradingPairsService.clearSearch();
          }
        }),
        catchError((error) => {
          console.error('Search error:', error);
          this.error = 'Search failed. Please try again.';
          return [];
        })
      )
      .subscribe(() => {
        // Results are handled by tradingPairs$ subscription
      });

    // Setup local search for real-time filtering
    this.localSearchSubject
      .pipe(debounceTime(150), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((searchTerm) => {
        this.applyLocalFilter(searchTerm);
      });
  }

  /**
   * Initialize trading pairs data
   */
  private initializeTradingPairs(): void {
    this.tradingPairsService
      .initializeTradingPairs()
      .pipe(
        takeUntil(this.destroy$),
        tap(() => console.log('Initial trading pairs loaded')),
        catchError((error) => {
          console.error('Failed to initialize trading pairs:', error);
          this.error = 'Failed to load trading pairs. Please refresh the page.';
          return [];
        })
      )
      .subscribe(() => {
        // Load initial market data for visible pairs
        this.loadInitialMarketData();
      });
  }

  /**
   * Connect to SignalR for real-time data
   */
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

  /**
   * Update trading pairs list and convert to display format
   */
  private updateTradingPairsList(pairs: TradingPair[]): void {
    // Convert to display pairs, preserving existing market data
    const displayPairs = pairs.map((pair) => {
      const existingPair = this.allTradingPairs.find(
        (p) => p.symbol === pair.symbol
      );
      if (existingPair) {
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
        return this.createTradingPairDisplay(pair);
      }
    });

    this.allTradingPairs = displayPairs;

    // Apply current search filter
    this.applyLocalFilter(this.searchTerm);

    console.log(
      `Updated trading pairs list: ${this.allTradingPairs.length} total pairs`
    );
  }

  /**
   * Apply local search filter to trading pairs
   */
  private applyLocalFilter(searchTerm: string): void {
    if (!searchTerm.trim()) {
      this.filteredPairs = [...this.allTradingPairs];
    } else {
      const searchLower = searchTerm.toLowerCase();
      this.filteredPairs = this.allTradingPairs.filter(
        (pair) =>
          pair.symbol.toLowerCase().includes(searchLower) ||
          pair.baseAsset.toLowerCase().includes(searchLower) ||
          pair.quoteAsset.toLowerCase().includes(searchLower) ||
          pair.displayName.toLowerCase().includes(searchLower)
      );
    }

    console.log(
      `Filtered pairs: ${this.filteredPairs.length} of ${this.allTradingPairs.length}`
    );
  }

  /**
   * Load initial market data for visible pairs
   */
  private loadInitialMarketData(): void {
    // Load market data for first 15 visible pairs
    const visiblePairs = this.filteredPairs.slice(0, 15);
    visiblePairs.forEach((pair, index) => {
      // Stagger requests to avoid overwhelming the API
      setTimeout(() => {
        if (pair.isLoading) {
          this.loadTickerData(pair.symbol);
        }
      }, index * 100); // 100ms delay between requests
    });
  }

  /**
   * Load ticker data for a specific symbol
   */
  private loadTickerData(symbol: string): void {
    // Check cache first
    const cachedData = this.marketDataCache.get(symbol);
    if (cachedData) {
      this.updatePairWithTickerData(symbol, cachedData);
      return;
    }

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
          this.marketDataCache.set(symbol, tickerData);
          this.updatePairWithTickerData(symbol, tickerData);
        }
      });
  }

  /**
   * Update selected pair
   */
  private updateSelectedPair(pair: TradingPair): void {
    const existingPair = this.allTradingPairs.find(
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

  /**
   * Create trading pair display object
   */
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

  /**
   * Format display name for trading pair
   */
  private formatDisplayName(pair: TradingPair): string {
    return `${pair.baseAsset}/${pair.quoteAsset}`;
  }

  /**
   * Update pair with ticker data
   */
  private updatePairWithTickerData(
    symbol: string,
    tickerData: TickerData
  ): void {
    this.updatePairProperties(symbol, {
      currentPrice: tickerData.lastPrice,
      priceChange: tickerData.priceChange,
      priceChangePercent: tickerData.priceChangePercent,
      volume24h: tickerData.volume,
      high24h: tickerData.highPrice,
      low24h: tickerData.lowPrice,
      isLoading: false,
    });

    if (this.selectedPair && this.selectedPair.symbol === symbol) {
      this.updateDailyStats();
    }
  }

  /**
   * Mark pair as loaded (when ticker data fails)
   */
  private markPairAsLoaded(symbol: string): void {
    this.updatePairProperties(symbol, { isLoading: false });
  }

  /**
   * Update multiple properties of a trading pair
   */
  private updatePairProperties(
    symbol: string,
    updates: Partial<TradingPairDisplay>
  ): void {
    // Update in all pairs array
    const allPairIndex = this.allTradingPairs.findIndex(
      (p) => p.symbol === symbol
    );
    if (allPairIndex !== -1) {
      this.allTradingPairs[allPairIndex] = {
        ...this.allTradingPairs[allPairIndex],
        ...updates,
      };
    }

    // Update in filtered pairs array
    const filteredPairIndex = this.filteredPairs.findIndex(
      (p) => p.symbol === symbol
    );
    if (filteredPairIndex !== -1) {
      this.filteredPairs[filteredPairIndex] = {
        ...this.filteredPairs[filteredPairIndex],
        ...updates,
      };
    }

    // Update selected pair if it matches
    if (this.selectedPair && this.selectedPair.symbol === symbol) {
      this.selectedPair = {
        ...this.selectedPair,
        ...updates,
      };
    }
  }

  /**
   * Update daily statistics for selected pair
   */
  private updateDailyStats(): void {
    if (this.selectedPair) {
      this.dailyHigh = this.selectedPair.high24h;
      this.dailyLow = this.selectedPair.low24h;
      this.dailyVolume = this.selectedPair.volume24h;
    }
  }

  /**
   * Subscribe to real-time data for selected pair
   */
  private async subscribeToRealTimeData(symbol: string): Promise<void> {
    try {
      // Unsubscribe from previous symbol
      if (this.selectedPair && this.selectedPair.symbol !== symbol) {
        await this.signalRService.unsubscribeFromTicker(
          this.selectedPair.symbol
        );
      }

      // Subscribe to new symbol
      await this.signalRService.subscribeToTicker(symbol);

      // Listen for real-time updates
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

  /**
   * Update pair with real-time data
   */
  private updatePairWithRealTimeData(
    symbol: string,
    tickerData: WebSocketTickerData
  ): void {
    this.updatePairProperties(symbol, {
      currentPrice: tickerData.lastPrice,
      priceChange: tickerData.priceChange,
      priceChangePercent: tickerData.priceChangePercent,
      volume24h: tickerData.totalTradedBaseAssetVolume,
      high24h: tickerData.highPrice,
      low24h: tickerData.lowPrice,
      isLoading: false,
    });

    if (this.selectedPair && this.selectedPair.symbol === symbol) {
      this.updateDailyStats();
    }
  }

  // Public methods for template

  /**
   * Handle dropdown scroll for infinite loading
   */
  public onDropdownScroll(event: Event): void {
    const element = event.target as HTMLElement;
    const threshold = 150; // Load more when 150px from bottom

    const isNearBottom =
      element.scrollTop + element.clientHeight >=
      element.scrollHeight - threshold;

    console.log('Scroll position:', {
      scrollTop: element.scrollTop,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      isNearBottom,
      canLoadMore: this.tradingPairsService.canLoadMore(),
      searchTerm: this.searchTerm,
    });

    if (
      isNearBottom &&
      this.tradingPairsService.canLoadMore() &&
      !this.searchTerm.trim()
    ) {
      // Only load more when not searching

      console.log('Loading more trading pairs...');
      this.loadMorePairs();
    }
  }

  /**
   * Load more trading pairs
   */
  private loadMorePairs(): void {
    this.tradingPairsService
      .loadMoreTradingPairs()
      .pipe(
        takeUntil(this.destroy$),
        catchError((error) => {
          console.error('Failed to load more pairs:', error);
          return [];
        })
      )
      .subscribe((newPairs) => {
        console.log(`Loaded ${newPairs.length} additional pairs`);
        // Load market data for new pairs
        if (newPairs.length > 0) {
          newPairs.slice(0, 5).forEach((pair) => {
            this.loadTickerData(pair.symbol);
          });
        }
      });
  }

  /**
   * Handle search input changes
   */
  public onSearchChange(searchTerm: string): void {
    this.searchTerm = searchTerm;

    // Use local search for immediate filtering
    this.localSearchSubject.next(searchTerm);

    // Also trigger API search for more comprehensive results
    this.searchSubject.next(searchTerm);
  }

  /**
   * Select a trading pair
   */
  public selectTradingPair(pair: TradingPairDisplay): void {
    this.tradingPairsService.setSelectedPair(pair);
    this.showPairSelector = false;
    this.searchTerm = '';
    this.localSearchSubject.next('');
  }

  /**
   * Toggle pair selector dropdown
   */
  public togglePairSelector(): void {
    this.showPairSelector = !this.showPairSelector;

    if (this.showPairSelector) {
      // Focus search input when opening
      setTimeout(() => {
        if (this.searchInput?.nativeElement) {
          this.searchInput.nativeElement.focus();
        }
      }, 100);
    } else {
      // Clear search when closing
      this.searchTerm = '';
      this.localSearchSubject.next('');
    }
  }

  /**
   * Refresh data
   */
  public refreshData(): void {
    this.error = null;
    this.marketDataCache.clear();
    this.tradingPairsService
      .refreshTradingPairs()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadInitialMarketData();
      });
  }

  /**
   * Track by function for ngFor optimization
   */
  public trackBySymbol(index: number, pair: TradingPairDisplay): string {
    return pair.symbol;
  }

  /**
   * Format price for display
   */
  public formatPrice(price: number): string {
    if (price >= 1) {
      return price.toFixed(2);
    } else if (price >= 0.01) {
      return price.toFixed(4);
    } else {
      return price.toFixed(6);
    }
  }

  /**
   * Format volume for display
   */
  public formatVolume(volume: number): string {
    if (volume >= 1000000) {
      return (volume / 1000000).toFixed(1) + 'M';
    } else if (volume >= 1000) {
      return (volume / 1000).toFixed(1) + 'K';
    }
    return volume.toFixed(0);
  }

  /**
   * Get price change CSS class
   */
  public getPriceChangeClass(change: number): string {
    return change >= 0 ? 'text-green-400' : 'text-red-400';
  }

  /**
   * Handle clicks outside dropdown to close it
   */
  @HostListener('document:click', ['$event'])
  public onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.pair-selector-container')) {
      this.showPairSelector = false;
      this.searchTerm = '';
      this.localSearchSubject.next('');
    }
  }
}
