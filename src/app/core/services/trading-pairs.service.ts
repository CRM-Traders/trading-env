import { Injectable, inject } from '@angular/core';
import { Observable, BehaviorSubject, throwError, of, EMPTY } from 'rxjs';
import { catchError, map, shareReplay, finalize, tap } from 'rxjs/operators';
import { HttpService } from './http.service';
import { HttpParams } from '@angular/common/http';

export interface TradingPair {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  baseAssetPrecision: number;
  quoteAssetPrecision: number;
  orderTypes: string[];
  iceBergAllowed: boolean;
  ocoAllowed: boolean;
  isSpotTradingAllowed: boolean;
  isMarginTradingAllowed: boolean;
  filters: Filter[];
}

export interface Filter {
  filterType: string;
  minPrice?: number;
  maxPrice?: number;
  tickSize?: number;
  minQty?: number;
  maxQty?: number;
  stepSize?: number;
  minNotional?: number;
  applyToMarket?: boolean;
  avgPriceMins?: number;
  limit?: number;
  maxNumOrders?: number;
  maxNumAlgoOrders?: number;
}

export interface TickerData {
  symbol: string;
  priceChange: number;
  priceChangePercent: number;
  weightedAvgPrice: number;
  prevClosePrice: number;
  lastPrice: number;
  lastQty: number;
  bidPrice: number;
  bidQty: number;
  askPrice: number;
  askQty: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number;
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
}

export interface OrderBookData {
  lastUpdateId: number;
  bids: number[][];
  asks: number[][];
}

export interface HistoricalDataPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalLoaded: number;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class TradingPairsService {
  private readonly httpService = inject(HttpService);
  private readonly DEFAULT_PAGE_SIZE = 30;

  // State management
  private readonly allTradingPairs: TradingPair[] = [];
  private readonly searchResults: TradingPair[] = [];
  private readonly tradingPairsSubject = new BehaviorSubject<TradingPair[]>([]);
  private readonly selectedPairSubject =
    new BehaviorSubject<TradingPair | null>(null);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);

  private readonly paginationState: PaginationState = {
    currentPage: 1, // Start from 1 for better page tracking
    pageSize: this.DEFAULT_PAGE_SIZE,
    totalLoaded: 0,
    hasMore: true,
    isLoading: false,
    isLoadingMore: false,
  };

  private readonly searchPaginationState: PaginationState = {
    currentPage: 1, // Start from 1 for better page tracking
    pageSize: this.DEFAULT_PAGE_SIZE,
    totalLoaded: 0,
    hasMore: true,
    isLoading: false,
    isLoadingMore: false,
  };

  private readonly paginationStateSubject =
    new BehaviorSubject<PaginationState>({
      ...this.paginationState,
    });

  // Public observables
  public readonly tradingPairs$ = this.tradingPairsSubject.asObservable();
  public readonly selectedPair$ = this.selectedPairSubject.asObservable();
  public readonly error$ = this.errorSubject.asObservable();
  public readonly loading$ = this.paginationStateSubject.pipe(
    map((state) => state.isLoading)
  );
  public readonly paginationState$ = this.paginationStateSubject.pipe(
    map((state) => ({
      hasMore: state.hasMore,
      currentPage: state.currentPage,
      totalPages: Math.ceil(state.totalLoaded / state.pageSize),
      totalCount: state.totalLoaded,
    }))
  );

  // Current search term
  private currentSearchTerm = '';
  private isSearchMode = false;

  constructor() {
    this.initializeDefaultPair();
  }

  /**
   * Initialize the service with default trading pairs
   */
  public initializeTradingPairs(): Observable<TradingPair[]> {
    if (this.allTradingPairs.length > 0) {
      // If we already have pairs, return them and ensure pagination state is correct
      this.paginationState.hasMore = true; // Assume more data is available
      this.updatePaginationState();
      return of(this.allTradingPairs);
    }

    // Reset pagination state for initial load
    this.paginationState.currentPage = 1;
    this.paginationState.hasMore = true;

    return this.loadTradingPairsPage(1, true, false);
  }

  /**
   * Load more trading pairs for infinite scroll
   */
  public loadMoreTradingPairs(): Observable<TradingPair[]> {
    const state = this.isSearchMode
      ? this.searchPaginationState
      : this.paginationState;

    console.log('LoadMoreTradingPairs called:', {
      isSearchMode: this.isSearchMode,
      currentPage: state.currentPage,
      hasMore: state.hasMore,
      isLoading: state.isLoading,
      isLoadingMore: state.isLoadingMore,
      totalLoaded: state.totalLoaded,
    });

    if (state.isLoadingMore || state.isLoading || !state.hasMore) {
      console.log('Cannot load more - already loading or no more data');
      return of([]);
    }

    const nextPage = state.currentPage + 1;
    console.log(`Loading page ${nextPage}`);
    return this.loadTradingPairsPage(nextPage, false, this.isSearchMode);
  }

  /**
   * Search trading pairs from backend
   */
  public searchTradingPairs(searchTerm: string): Observable<TradingPair[]> {
    this.currentSearchTerm = searchTerm.toLowerCase().trim();

    if (!this.currentSearchTerm) {
      return this.clearSearch();
    }

    // Reset search state
    this.isSearchMode = true;
    this.searchResults.length = 0;
    this.searchPaginationState.currentPage = 1;
    this.searchPaginationState.totalLoaded = 0;
    this.searchPaginationState.hasMore = true;

    return this.loadTradingPairsPage(1, true, true);
  }

  /**
   * Clear search and return to normal mode
   */
  public clearSearch(): Observable<TradingPair[]> {
    this.currentSearchTerm = '';
    this.isSearchMode = false;
    this.searchResults.length = 0;

    // Reset search pagination state
    this.searchPaginationState.currentPage = 1;
    this.searchPaginationState.totalLoaded = 0;
    this.searchPaginationState.hasMore = true;

    // Update to show all loaded pairs
    this.tradingPairsSubject.next([...this.allTradingPairs]);
    this.updatePaginationState();

    return of(this.allTradingPairs);
  }

  /**
   * Refresh all trading pairs
   */
  public refreshTradingPairs(): Observable<TradingPair[]> {
    this.resetState();
    return this.loadTradingPairsPage(1, true, false);
  }

  /**
   * Check if more data can be loaded
   */
  public canLoadMore(): boolean {
    const state = this.isSearchMode
      ? this.searchPaginationState
      : this.paginationState;
    const canLoad = state.hasMore && !state.isLoading && !state.isLoadingMore;
    console.log('canLoadMore:', canLoad, 'state:', state);
    return canLoad;
  }

  /**
   * Check if currently loading more data
   */
  public isCurrentlyLoadingMore(): boolean {
    const state = this.isSearchMode
      ? this.searchPaginationState
      : this.paginationState;
    return state.isLoadingMore;
  }

  /**
   * Get current search term
   */
  public getCurrentSearchTerm(): string {
    return this.currentSearchTerm;
  }

  /**
   * Check if in search mode
   */
  public isInSearchMode(): boolean {
    return this.isSearchMode;
  }

  /**
   * Set selected trading pair
   */
  public setSelectedPair(pair: TradingPair): void {
    this.selectedPairSubject.next(pair);
  }

  /**
   * Get selected trading pair
   */
  public getSelectedPair(): TradingPair | null {
    return this.selectedPairSubject.value;
  }

  /**
   * Get all loaded trading pairs
   */
  public getAllTradingPairs(): TradingPair[] {
    return [...this.allTradingPairs];
  }

  /**
   * Get popular trading pairs (USDT pairs)
   */
  public getPopularPairs(): TradingPair[] {
    return this.allTradingPairs
      .filter(
        (pair) =>
          pair.quoteAsset === 'USDT' &&
          pair.status === 'TRADING' &&
          pair.isSpotTradingAllowed
      )
      .slice(0, 10);
  }

  /**
   * Get ticker data for a specific symbol
   */
  public getTickerData(symbol: string): Observable<TickerData> {
    return this.httpService
      .get<TickerData>(`binance/api/binance/ticker/${symbol}`)
      .pipe(
        catchError((error) => {
          console.error(`Failed to fetch ticker data for ${symbol}:`, error);
          return throwError(
            () => new Error(`Failed to fetch ticker data for ${symbol}`)
          );
        })
      );
  }

  /**
   * Get all tickers
   */
  public getAllTickers(): Observable<TickerData[]> {
    return this.httpService
      .get<TickerData[]>('binance/api/binance/tickers')
      .pipe(
        catchError((error) => {
          console.error('Failed to fetch all tickers:', error);
          return throwError(() => new Error('Failed to fetch all tickers'));
        })
      );
  }

  /**
   * Get order book data
   */
  public getOrderBook(
    symbol: string,
    limit: number = 100
  ): Observable<OrderBookData> {
    return this.httpService
      .get<OrderBookData>(
        `binance/api/binance/orderbook/${symbol}?limit=${limit}`
      )
      .pipe(
        catchError((error) => {
          console.error(`Failed to fetch order book for ${symbol}:`, error);
          return throwError(
            () => new Error(`Failed to fetch order book for ${symbol}`)
          );
        })
      );
  }

  /**
   * Get historical data
   */
  public getHistoricalData(
    symbol: string,
    interval: string = '1h',
    limit: number = 500
  ): Observable<HistoricalDataPoint[]> {
    return this.httpService
      .get<HistoricalDataPoint[]>(
        `binance/api/binance/historical-data/${symbol}?interval=${interval}&limit=${limit}`
      )
      .pipe(
        catchError((error) => {
          console.error(
            `Failed to fetch historical data for ${symbol}:`,
            error
          );
          return throwError(
            () => new Error(`Failed to fetch historical data for ${symbol}`)
          );
        })
      );
  }

  /**
   * Private method to load a specific page of trading pairs
   */
  private loadTradingPairsPage(
    page: number,
    isInitial: boolean,
    isSearch: boolean
  ): Observable<TradingPair[]> {
    const state = isSearch ? this.searchPaginationState : this.paginationState;
    const isLoadingMore = !isInitial && page > 1;

    // Update loading state
    if (isLoadingMore) {
      state.isLoadingMore = true;
    } else {
      state.isLoading = true;
    }

    this.updatePaginationState();
    this.errorSubject.next(null);

    // Build URL with search parameter if needed
    let url = `binance/api/binance/trading-pairs?pageIndex=${
      page - 1
    }&pageSize=${state.pageSize}`;
    if (isSearch && this.currentSearchTerm) {
      url += `&search=${encodeURIComponent(this.currentSearchTerm)}`;
    }

    console.log(`Requesting: ${url}`);

    return this.httpService.get<any>(url).pipe(
      tap((response) =>
        console.log(`API Response for page ${page}:`, {
          isArray: Array.isArray(response),
          hasItems: response?.items !== undefined,
          itemsLength:
            response?.items?.length ||
            (Array.isArray(response) ? response.length : 0),
          hasNextPage: response?.hasNextPage,
        })
      ),
      map((response) =>
        this.processApiResponse(response, page, isLoadingMore, isSearch)
      ),
      tap((pairs) => {
        console.log(`Processed ${pairs.length} pairs for page ${page}`);
        console.log(`Updated state after processing:`, {
          currentPage: state.currentPage,
          hasMore: state.hasMore,
          totalLoaded: state.totalLoaded,
        });
      }),
      shareReplay(1),
      finalize(() => {
        state.isLoading = false;
        state.isLoadingMore = false;
        this.updatePaginationState();
        console.log('Finalized loading state:', state);
      }),
      catchError((error) => {
        console.error(`Error loading trading pairs page ${page}:`, error);
        this.handleApiError(error);
        state.isLoading = false;
        state.isLoadingMore = false;
        this.updatePaginationState();
        return of([]);
      })
    );
  }

  /**
   * Process API response and update internal state
   */
  private processApiResponse(
    response: any,
    page: number,
    isLoadingMore: boolean,
    isSearch: boolean
  ): TradingPair[] {
    let pairs: TradingPair[] = [];
    let unfilteredCount = 0;
    let hasMoreData = true; // DEFAULT TO TRUE

    // Handle different response formats
    if (Array.isArray(response)) {
      // Direct array response
      unfilteredCount = response.length;
      pairs = this.filterAndSortPairs(response);
      // CRITICAL FIX: Always assume more data until we've tried at least 3 pages
      // OR if we get less than half the page size in unfiltered results
      hasMoreData = page < 3 || unfilteredCount >= this.DEFAULT_PAGE_SIZE / 2;
    } else if (response && response.items && Array.isArray(response.items)) {
      // Paginated response
      unfilteredCount = response.items.length;
      pairs = this.filterAndSortPairs(response.items);
      // If the API explicitly tells us there's no more, respect that
      // Otherwise, always try at least 3 pages
      if (response.hasNextPage !== undefined) {
        hasMoreData = response.hasNextPage;
      } else {
        // CRITICAL FIX: Always assume more data until we've tried at least 3 pages
        // OR if we get less than half the page size in unfiltered results
        hasMoreData = page < 3 || unfilteredCount >= this.DEFAULT_PAGE_SIZE / 2;
      }
    } else {
      // Fallback to default pairs
      console.warn('Unexpected API response format, using fallback data');
      pairs = this.createFallbackPairs();
      hasMoreData = false;
    }

    console.log(
      `ProcessApiResponse - Page: ${page}, Unfiltered count: ${unfilteredCount}, Filtered pairs: ${pairs.length}, Has more: ${hasMoreData}`
    );

    // Update internal state based on mode
    if (isSearch) {
      const state = this.searchPaginationState;
      if (isLoadingMore) {
        this.searchResults.push(...pairs);
      } else {
        this.searchResults.length = 0;
        this.searchResults.push(...pairs);
      }

      // Update the current page regardless of filtered count
      state.currentPage = page;
      state.totalLoaded = this.searchResults.length;
      state.hasMore = hasMoreData;

      // Update subject with search results
      this.tradingPairsSubject.next([...this.searchResults]);
    } else {
      const state = this.paginationState;
      if (isLoadingMore) {
        // Append new pairs
        this.allTradingPairs.push(...pairs);
      } else {
        // Replace all pairs (initial load)
        this.allTradingPairs.length = 0;
        this.allTradingPairs.push(...pairs);
      }

      // Update the current page regardless of filtered count
      state.currentPage = page;
      state.totalLoaded = this.allTradingPairs.length;
      state.hasMore = hasMoreData;

      // Update subject with all pairs
      this.tradingPairsSubject.next([...this.allTradingPairs]);
    }

    console.log(
      `State updated - Mode: ${isSearch ? 'search' : 'normal'}, Current Page: ${
        isSearch
          ? this.searchPaginationState.currentPage
          : this.paginationState.currentPage
      }, Total loaded: ${
        isSearch ? this.searchResults.length : this.allTradingPairs.length
      }, Has more: ${
        isSearch
          ? this.searchPaginationState.hasMore
          : this.paginationState.hasMore
      }`
    );

    this.updatePaginationState();

    // Set default selected pair if none selected
    if (!this.selectedPairSubject.value && this.allTradingPairs.length > 0) {
      const defaultPair =
        this.allTradingPairs.find((p) => p.symbol === 'BTCUSDT') ||
        this.allTradingPairs[0];
      this.setSelectedPair(defaultPair);
    }

    return pairs;
  }

  /**
   * Filter and sort trading pairs
   */
  private filterAndSortPairs(pairs: any[]): TradingPair[] {
    if (!pairs || !Array.isArray(pairs)) {
      console.warn('Invalid pairs data received:', pairs);
      return [];
    }

    return pairs
      .filter(
        (pair) =>
          pair &&
          pair.symbol &&
          pair.status === 'TRADING' &&
          pair.isSpotTradingAllowed === true
      )
      .map((pair) => ({
        symbol: pair.symbol,
        baseAsset: pair.baseAsset,
        quoteAsset: pair.quoteAsset,
        status: pair.status,
        baseAssetPrecision: pair.baseAssetPrecision || 8,
        quoteAssetPrecision: pair.quoteAssetPrecision || 8,
        orderTypes: pair.orderTypes || ['LIMIT', 'MARKET'],
        iceBergAllowed: pair.iceBergAllowed || false,
        ocoAllowed: pair.ocoAllowed || false,
        isSpotTradingAllowed: pair.isSpotTradingAllowed || false,
        isMarginTradingAllowed: pair.isMarginTradingAllowed || false,
        filters: pair.filters || [],
      }))
      .sort((a, b) => {
        // Prioritize USDT pairs
        if (a.quoteAsset === 'USDT' && b.quoteAsset !== 'USDT') return -1;
        if (b.quoteAsset === 'USDT' && a.quoteAsset !== 'USDT') return 1;

        // Then sort alphabetically
        return a.symbol.localeCompare(b.symbol);
      });
  }

  /**
   * Create fallback pairs for when API fails
   */
  private createFallbackPairs(): TradingPair[] {
    return [
      {
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        status: 'TRADING',
        baseAssetPrecision: 8,
        quoteAssetPrecision: 8,
        orderTypes: ['LIMIT', 'MARKET'],
        iceBergAllowed: true,
        ocoAllowed: true,
        isSpotTradingAllowed: true,
        isMarginTradingAllowed: true,
        filters: [],
      },
      {
        symbol: 'ETHUSDT',
        baseAsset: 'ETH',
        quoteAsset: 'USDT',
        status: 'TRADING',
        baseAssetPrecision: 8,
        quoteAssetPrecision: 8,
        orderTypes: ['LIMIT', 'MARKET'],
        iceBergAllowed: true,
        ocoAllowed: true,
        isSpotTradingAllowed: true,
        isMarginTradingAllowed: true,
        filters: [],
      },
      {
        symbol: 'ADAUSDT',
        baseAsset: 'ADA',
        quoteAsset: 'USDT',
        status: 'TRADING',
        baseAssetPrecision: 8,
        quoteAssetPrecision: 8,
        orderTypes: ['LIMIT', 'MARKET'],
        iceBergAllowed: true,
        ocoAllowed: true,
        isSpotTradingAllowed: true,
        isMarginTradingAllowed: true,
        filters: [],
      },
    ];
  }

  /**
   * Initialize default trading pair
   */
  private initializeDefaultPair(): void {
    const defaultPair = this.createFallbackPairs()[0];
    this.selectedPairSubject.next(defaultPair);
  }

  /**
   * Reset internal state
   */
  private resetState(): void {
    this.allTradingPairs.length = 0;
    this.searchResults.length = 0;
    this.currentSearchTerm = '';
    this.isSearchMode = false;

    // Reset normal pagination state
    this.paginationState.currentPage = 1;
    this.paginationState.totalLoaded = 0;
    this.paginationState.hasMore = true; // ALWAYS START WITH TRUE
    this.paginationState.isLoading = false;
    this.paginationState.isLoadingMore = false;

    // Reset search pagination state
    this.searchPaginationState.currentPage = 1;
    this.searchPaginationState.totalLoaded = 0;
    this.searchPaginationState.hasMore = true; // ALWAYS START WITH TRUE
    this.searchPaginationState.isLoading = false;
    this.searchPaginationState.isLoadingMore = false;

    this.updatePaginationState();
  }

  /**
   * Update pagination state subject
   */
  private updatePaginationState(): void {
    const state = this.isSearchMode
      ? this.searchPaginationState
      : this.paginationState;
    this.paginationStateSubject.next({ ...state });
  }

  /**
   * Handle API errors
   */
  private handleApiError(error: any): void {
    const errorMessage =
      error?.error?.message || error?.message || 'Failed to load trading pairs';
    this.errorSubject.next(errorMessage);
    console.error('Trading pairs API error:', error);
  }
}
