import { Injectable, inject } from '@angular/core';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { HttpService } from './http.service';

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

// New interfaces for pagination
export interface TradingPairsPaginatedResponse {
  items: TradingPair[];
  pageIndex: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface TradingPairsRequest {
  search?: string;
  pageIndex?: number;
  pageSize?: number;
}

@Injectable({
  providedIn: 'root',
})
export class TradingPairsService {
  private readonly httpService = inject(HttpService);

  private readonly tradingPairsSubject = new BehaviorSubject<TradingPair[]>([]);
  private readonly selectedPairSubject =
    new BehaviorSubject<TradingPair | null>(null);
  private readonly loadingSubject = new BehaviorSubject<boolean>(false);
  private readonly errorSubject = new BehaviorSubject<string | null>(null);

  // New subjects for pagination
  private readonly paginationStateSubject = new BehaviorSubject<{
    hasMore: boolean;
    currentPage: number;
    totalPages: number;
    totalCount: number;
  }>({
    hasMore: true,
    currentPage: 0,
    totalPages: 0,
    totalCount: 0,
  });

  public readonly tradingPairs$ = this.tradingPairsSubject.asObservable();
  public readonly selectedPair$ = this.selectedPairSubject.asObservable();
  public readonly loading$ = this.loadingSubject.asObservable();
  public readonly error$ = this.errorSubject.asObservable();
  public readonly paginationState$ = this.paginationStateSubject.asObservable();

  private allTradingPairs: TradingPair[] = [];
  private currentSearchTerm = '';
  private readonly DEFAULT_PAGE_SIZE = 20;

  constructor() {
    this.initializeDefaultPair();
  }

  /**
   * Fetch trading pairs with pagination support
   */
  public fetchTradingPairs(
    search?: string,
    pageIndex: number = 1,
    pageSize: number = this.DEFAULT_PAGE_SIZE,
    loadMore: boolean = false
  ): Observable<TradingPairsPaginatedResponse> {
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    if (search !== undefined) {
      this.currentSearchTerm = search;
    }

    // Reset pagination if new search or not loading more
    if (!loadMore || search !== this.currentSearchTerm) {
      this.resetPagination();
      this.allTradingPairs = [];
    }

    const params: TradingPairsRequest = {
      pageIndex: pageIndex,
      pageSize: pageSize,
      search: this.currentSearchTerm,
    };

    return this.httpService
      .get<TradingPairsPaginatedResponse>(
        'binance/api/binance/trading-pairs',
        this.buildHttpParams(params)
      )
      .pipe(
        map((response) => this.processPaginatedResponse(response, loadMore)),
        shareReplay(1),
        catchError((error) =>
          this.handleError('Failed to fetch trading pairs', error)
        )
      );
  }

  /**
   * Load more trading pairs (infinite scroll)
   */
  public loadMoreTradingPairs(): Observable<TradingPairsPaginatedResponse> {
    const currentState = this.paginationStateSubject.value;

    if (!currentState.hasMore || this.loadingSubject.value) {
      return throwError(() => new Error('No more data or already loading'));
    }

    const nextPage = currentState.currentPage + 1;
    return this.fetchTradingPairs(
      this.currentSearchTerm,
      nextPage,
      this.DEFAULT_PAGE_SIZE,
      true
    );
  }

  /**
   * Search trading pairs with pagination reset
   */
  public searchTradingPairs(
    searchTerm: string
  ): Observable<TradingPairsPaginatedResponse> {
    return this.fetchTradingPairs(searchTerm, 1, this.DEFAULT_PAGE_SIZE, false);
  }

  /**
   * Clear search and reload
   */
  public clearSearch(): Observable<TradingPairsPaginatedResponse> {
    return this.fetchTradingPairs('', 1, this.DEFAULT_PAGE_SIZE, false);
  }

  private processPaginatedResponse(
    response: TradingPairsPaginatedResponse,
    loadMore: boolean
  ): TradingPairsPaginatedResponse {
    const filteredPairs = this.filterAndSortPairs(response.items);

    if (loadMore) {
      // Append new pairs to existing ones
      this.allTradingPairs = [...this.allTradingPairs, ...filteredPairs];
    } else {
      // Replace with new pairs
      this.allTradingPairs = filteredPairs;
    }

    // Update subjects
    this.tradingPairsSubject.next([...this.allTradingPairs]);
    this.loadingSubject.next(false);

    // Update pagination state
    this.paginationStateSubject.next({
      hasMore: response.hasNextPage,
      currentPage: response.pageIndex,
      totalPages: response.totalPages,
      totalCount: response.totalCount,
    });

    // Set default selected pair if none selected
    if (!this.selectedPairSubject.value && this.allTradingPairs.length > 0) {
      const defaultPair =
        this.allTradingPairs.find((p) => p.symbol === 'BTCUSDT') ||
        this.allTradingPairs[0];
      this.setSelectedPair(defaultPair);
    }

    return {
      ...response,
      items: this.allTradingPairs,
    };
  }

  private buildHttpParams(params: TradingPairsRequest): any {
    const httpParams: any = {};

    if (params.pageIndex) {
      httpParams.pageIndex = params.pageIndex.toString();
    }

    if (params.pageSize) {
      httpParams.pageSize = params.pageSize.toString();
    }

    if (params.search) {
      httpParams.search = params.search;
    }

    return httpParams;
  }

  private resetPagination(): void {
    this.paginationStateSubject.next({
      hasMore: true,
      currentPage: 0,
      totalPages: 0,
      totalCount: 0,
    });
  }

  // Keep existing methods for backward compatibility
  public getTickerData(symbol: string): Observable<TickerData> {
    return this.httpService
      .get<TickerData>(`binance/api/binance/ticker/${symbol}`)
      .pipe(
        catchError((error) =>
          this.handleError(`Failed to fetch ticker data for ${symbol}`, error)
        )
      );
  }

  public getAllTickers(): Observable<TickerData[]> {
    return this.httpService
      .get<TickerData[]>('binance/api/binance/tickers')
      .pipe(
        catchError((error) =>
          this.handleError('Failed to fetch all tickers', error)
        )
      );
  }

  public getOrderBook(
    symbol: string,
    limit: number = 100
  ): Observable<OrderBookData> {
    return this.httpService
      .get<OrderBookData>(
        `binance/api/binance/orderbook/${symbol}?limit=${limit}`
      )
      .pipe(
        catchError((error) =>
          this.handleError(`Failed to fetch order book for ${symbol}`, error)
        )
      );
  }

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
        catchError((error) =>
          this.handleError(
            `Failed to fetch historical data for ${symbol}`,
            error
          )
        )
      );
  }

  public setSelectedPair(pair: TradingPair): void {
    this.selectedPairSubject.next(pair);
  }

  public getSelectedPair(): TradingPair | null {
    return this.selectedPairSubject.value;
  }

  public getAllTradingPairs(): TradingPair[] {
    return [...this.allTradingPairs];
  }

  public getCurrentSearchTerm(): string {
    return this.currentSearchTerm;
  }

  public getPopularPairs(): TradingPair[] {
    const currentPairs = this.tradingPairsSubject.value;
    return currentPairs
      .filter(
        (pair) =>
          pair.quoteAsset.toLowerCase().includes('usd') &&
          pair.status === 'TRADING'
      )
      .slice(0, 10);
  }

  public refreshTradingPairs(): Observable<TradingPairsPaginatedResponse> {
    return this.fetchTradingPairs(
      this.currentSearchTerm,
      1,
      this.DEFAULT_PAGE_SIZE,
      false
    );
  }

  private filterAndSortPairs(pairs: TradingPair[]): TradingPair[] {
    return pairs
      .filter((pair) => pair.status === 'TRADING' && pair.isSpotTradingAllowed)
      .sort((a, b) => {
        if (a.quoteAsset === 'USDT' && b.quoteAsset !== 'USDT') return -1;
        if (b.quoteAsset === 'USDT' && a.quoteAsset !== 'USDT') return 1;
        return a.symbol.localeCompare(b.symbol);
      });
  }

  private initializeDefaultPair(): void {
    const defaultPair: TradingPair = {
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
    };

    this.selectedPairSubject.next(defaultPair);
  }

  private handleError(message: string, error: any): Observable<never> {
    const errorMessage = error?.error?.message || error?.message || message;
    this.errorSubject.next(errorMessage);
    this.loadingSubject.next(false);
    console.error(message, error);
    return throwError(() => new Error(errorMessage));
  }
}
