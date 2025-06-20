import { Injectable, inject } from '@angular/core';
import { Observable, BehaviorSubject, throwError, of } from 'rxjs';
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
  private readonly tradingPairsSubject = new BehaviorSubject<TradingPair[]>([]);
  private readonly selectedPairSubject =
    new BehaviorSubject<TradingPair | null>(null);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);

  private readonly paginationState: PaginationState = {
    currentPage: 0,
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

  constructor() {
    this.initializeDefaultPair();
  }

  /**
   * Initialize the service with default trading pairs
   */
  public initializeTradingPairs(): Observable<TradingPair[]> {
    if (this.allTradingPairs.length > 0) {
      return of(this.allTradingPairs);
    }

    return this.loadTradingPairsPage(1, true);
  }

  /**
   * Load more trading pairs for infinite scroll
   */
  public loadMoreTradingPairs(): Observable<TradingPair[]> {
    if (
      this.paginationState.isLoadingMore ||
      this.paginationState.isLoading ||
      !this.paginationState.hasMore
    ) {
      return of([]);
    }

    const nextPage = this.paginationState.currentPage + 1;
    return this.loadTradingPairsPage(nextPage, false);
  }

  /**
   * Search trading pairs - this filters locally for better performance
   */
  public searchTradingPairs(searchTerm: string): Observable<TradingPair[]> {
    this.currentSearchTerm = searchTerm.toLowerCase().trim();
    this.paginationState.currentPage = 0;

    if (!this.currentSearchTerm) {
      this.tradingPairsSubject.next([...this.allTradingPairs]);
      return of(this.allTradingPairs);
    }

    const filteredPairs = this.allTradingPairs.filter(
      (pair) =>
        pair.symbol.toLowerCase().includes(this.currentSearchTerm) ||
        pair.baseAsset.toLowerCase().includes(this.currentSearchTerm) ||
        pair.quoteAsset.toLowerCase().includes(this.currentSearchTerm)
    );

    this.tradingPairsSubject.next(filteredPairs);
    return of(filteredPairs);
  }

  /**
   * Clear search and return all pairs
   */
  public clearSearch(): Observable<TradingPair[]> {
    this.currentSearchTerm = '';
    this.tradingPairsSubject.next([...this.allTradingPairs]);
    return of(this.allTradingPairs);
  }

  /**
   * Refresh all trading pairs
   */
  public refreshTradingPairs(): Observable<TradingPair[]> {
    this.resetState();
    return this.loadTradingPairsPage(1, true);
  }

  /**
   * Check if more data can be loaded
   */
  public canLoadMore(): boolean {
    return (
      this.paginationState.hasMore &&
      !this.paginationState.isLoading &&
      !this.paginationState.isLoadingMore &&
      !this.currentSearchTerm
    ); // Don't load more when searching
  }

  /**
   * Check if currently loading more data
   */
  public isCurrentlyLoadingMore(): boolean {
    return this.paginationState.isLoadingMore;
  }

  /**
   * Get current search term
   */
  public getCurrentSearchTerm(): string {
    return this.currentSearchTerm;
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
    isInitial: boolean
  ): Observable<TradingPair[]> {
    const isLoadingMore = !isInitial && page > 1;

    // Update loading state
    if (isLoadingMore) {
      this.paginationState.isLoadingMore = true;
    } else {
      this.paginationState.isLoading = true;
    }

    this.updatePaginationState();
    this.errorSubject.next(null);

    return this.httpService
      .get<any>(
        `binance/api/binance/trading-pairs?pageIndex=${page - 1}&pageSize=${
          this.paginationState.pageSize
        }`
      )
      .pipe(
        tap(() =>
          console.log(`Loading page ${page}, isLoadingMore: ${isLoadingMore}`)
        ),
        map((response) =>
          this.processApiResponse(response, page, isLoadingMore)
        ),
        tap((pairs) =>
          console.log(`Loaded ${pairs.length} pairs for page ${page}`)
        ),
        shareReplay(1),
        finalize(() => {
          this.paginationState.isLoading = false;
          this.paginationState.isLoadingMore = false;
          this.updatePaginationState();
        }),
        catchError((error) => {
          console.error(`Error loading trading pairs page ${page}:`, error);
          this.handleApiError(error);
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
    isLoadingMore: boolean
  ): TradingPair[] {
    let pairs: TradingPair[] = [];
    let hasMoreData = false;

    // Handle different response formats
    if (Array.isArray(response)) {
      // Direct array response
      pairs = this.filterAndSortPairs(response);
      hasMoreData = pairs.length === this.paginationState.pageSize;
    } else if (response && response.items && Array.isArray(response.items)) {
      // Paginated response
      pairs = this.filterAndSortPairs(response.items);
      hasMoreData = response.hasNextPage || false;
    } else {
      // Fallback to default pairs
      console.warn('Unexpected API response format, using fallback data');
      pairs = this.createFallbackPairs();
      hasMoreData = false;
    }

    // Update internal state
    if (isLoadingMore) {
      // Append new pairs
      this.allTradingPairs.push(...pairs);
      this.paginationState.currentPage = page;
      this.paginationState.totalLoaded = this.allTradingPairs.length;
      this.paginationState.hasMore = hasMoreData;
    } else {
      // Replace all pairs (initial load or refresh)
      this.allTradingPairs.length = 0;
      this.allTradingPairs.push(...pairs);
      this.paginationState.currentPage = page;
      this.paginationState.totalLoaded = pairs.length;
      this.paginationState.hasMore = hasMoreData;
    }

    // Update subjects
    this.tradingPairsSubject.next([...this.allTradingPairs]);
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
    this.currentSearchTerm = '';
    this.paginationState.currentPage = 0;
    this.paginationState.totalLoaded = 0;
    this.paginationState.hasMore = true;
    this.paginationState.isLoading = false;
    this.paginationState.isLoadingMore = false;
    this.updatePaginationState();
  }

  /**
   * Update pagination state subject
   */
  private updatePaginationState(): void {
    this.paginationStateSubject.next({ ...this.paginationState });
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
