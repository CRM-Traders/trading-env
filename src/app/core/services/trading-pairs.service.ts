import { Injectable, inject } from '@angular/core';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { catchError, map, shareReplay, finalize } from 'rxjs/operators';
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
  private readonly DEFAULT_PAGE_SIZE = 30;
  private isLoadingMore = false;

  constructor() {
    this.initializeDefaultPair();
  }

  public fetchTradingPairs(
    search?: string,
    pageIndex: number = 1,
    pageSize: number = this.DEFAULT_PAGE_SIZE,
    loadMore: boolean = false
  ): Observable<TradingPairsPaginatedResponse> {
    // Prevent multiple simultaneous requests
    if (this.loadingSubject.value && !loadMore) {
      return throwError(() => new Error('Request already in progress'));
    }

    if (this.isLoadingMore && loadMore) {
      return throwError(() => new Error('Load more already in progress'));
    }

    // Set loading states
    if (loadMore) {
      this.isLoadingMore = true;
    } else {
      this.loadingSubject.next(true);
      this.errorSubject.next(null);
    }

    // Handle search term changes
    const searchChanged =
      search !== undefined && search !== this.currentSearchTerm;
    if (search !== undefined) {
      this.currentSearchTerm = search;
    }

    // Reset data if not loading more or search changed
    if (!loadMore || searchChanged) {
      this.resetPagination();
      this.allTradingPairs = [];
    }

    const params: TradingPairsRequest = {
      pageIndex: pageIndex,
      pageSize: pageSize,
      search: this.currentSearchTerm || undefined,
    };

    return this.httpService
      .get<any>(
        'binance/api/binance/trading-pairs',
        this.buildHttpParams(params)
      )
      .pipe(
        map((response) =>
          this.processPaginatedResponse(response, loadMore, pageIndex, pageSize)
        ),
        shareReplay(1),
        finalize(() => {
          if (loadMore) {
            this.isLoadingMore = false;
          } else {
            this.loadingSubject.next(false);
          }
        }),
        catchError((error) => {
          console.error('Error fetching trading pairs:', error);
          this.handleError('Failed to fetch trading pairs', error);

          if (loadMore) {
            this.isLoadingMore = false;
          } else {
            this.loadingSubject.next(false);
          }

          return throwError(() => error);
        })
      );
  }

  public loadMoreTradingPairs(): Observable<TradingPairsPaginatedResponse> {
    const currentState = this.paginationStateSubject.value;

    if (
      !currentState.hasMore ||
      this.isLoadingMore ||
      this.loadingSubject.value
    ) {
      return throwError(() => new Error('Cannot load more at this time'));
    }

    const nextPage = currentState.currentPage + 1;
    return this.fetchTradingPairs(
      this.currentSearchTerm,
      nextPage,
      this.DEFAULT_PAGE_SIZE,
      true
    );
  }

  public searchTradingPairs(
    searchTerm: string
  ): Observable<TradingPairsPaginatedResponse> {
    // Reset loading more state when starting new search
    this.isLoadingMore = false;
    return this.fetchTradingPairs(searchTerm, 1, this.DEFAULT_PAGE_SIZE, false);
  }

  public clearSearch(): Observable<TradingPairsPaginatedResponse> {
    // Reset loading more state when clearing search
    this.isLoadingMore = false;
    return this.fetchTradingPairs('', 1, this.DEFAULT_PAGE_SIZE, false);
  }

  private processPaginatedResponse(
    response: any,
    loadMore: boolean,
    requestedPage: number,
    requestedPageSize: number
  ): TradingPairsPaginatedResponse {
    let processedResponse: TradingPairsPaginatedResponse;

    // Handle different response formats
    if (Array.isArray(response)) {
      // Response is directly an array of trading pairs
      const items = response as TradingPair[];
      const filteredPairs = this.filterAndSortPairs(items);

      processedResponse = {
        items: filteredPairs,
        pageIndex: requestedPage,
        pageSize: requestedPageSize,
        totalCount: filteredPairs.length,
        totalPages: Math.ceil(filteredPairs.length / requestedPageSize),
        hasPreviousPage: requestedPage > 1,
        hasNextPage: false, // Since we got all items at once
      };
    } else if (response && typeof response === 'object' && response.items) {
      // Response is a paginated wrapper
      const filteredPairs = this.filterAndSortPairs(response.items || []);

      processedResponse = {
        items: filteredPairs,
        pageIndex: response.pageIndex || requestedPage,
        pageSize: response.pageSize || requestedPageSize,
        totalCount: response.totalCount || filteredPairs.length,
        totalPages:
          response.totalPages ||
          Math.ceil(
            (response.totalCount || filteredPairs.length) /
              (response.pageSize || requestedPageSize)
          ),
        hasPreviousPage: response.hasPreviousPage || false,
        hasNextPage: response.hasNextPage || false,
      };
    } else {
      // Fallback to default response
      console.warn('Unexpected response format, using fallback');
      processedResponse = this.createFallbackResponse();
    }

    // Update internal state
    if (loadMore && processedResponse.items.length > 0) {
      // Append new items
      this.allTradingPairs = [
        ...this.allTradingPairs,
        ...processedResponse.items,
      ];
    } else {
      // Replace all items
      this.allTradingPairs = [...processedResponse.items];
    }

    // Update subjects
    this.tradingPairsSubject.next([...this.allTradingPairs]);

    // Update pagination state
    this.paginationStateSubject.next({
      hasMore:
        processedResponse.hasNextPage && processedResponse.items.length > 0,
      currentPage: processedResponse.pageIndex,
      totalPages: processedResponse.totalPages,
      totalCount: loadMore
        ? this.allTradingPairs.length
        : processedResponse.totalCount,
    });

    // Set default selected pair if none selected
    if (!this.selectedPairSubject.value && this.allTradingPairs.length > 0) {
      const defaultPair =
        this.allTradingPairs.find((p) => p.symbol === 'BTCUSDT') ||
        this.allTradingPairs[0];
      this.setSelectedPair(defaultPair);
    }

    // Return the updated response with all items
    return {
      ...processedResponse,
      items: [...this.allTradingPairs],
    };
  }

  private createFallbackResponse(): TradingPairsPaginatedResponse {
    const fallbackPairs: TradingPair[] = [
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

    return {
      items: fallbackPairs,
      pageIndex: 1,
      pageSize: this.DEFAULT_PAGE_SIZE,
      totalCount: fallbackPairs.length,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    };
  }

  private buildHttpParams(params: TradingPairsRequest): any {
    const httpParams: any = {};

    if (params.pageIndex !== undefined) {
      httpParams.pageIndex = params.pageIndex.toString();
    }

    if (params.pageSize !== undefined) {
      httpParams.pageSize = params.pageSize.toString();
    }

    if (params.search && params.search.trim()) {
      httpParams.search = params.search.trim();
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
    // Reset loading more state when refreshing
    this.isLoadingMore = false;
    return this.fetchTradingPairs(
      this.currentSearchTerm,
      1,
      this.DEFAULT_PAGE_SIZE,
      false
    );
  }

  public canLoadMore(): boolean {
    const state = this.paginationStateSubject.value;
    return state.hasMore && !this.isLoadingMore && !this.loadingSubject.value;
  }

  public isCurrentlyLoadingMore(): boolean {
    return this.isLoadingMore;
  }

  private filterAndSortPairs(pairs: TradingPair[]): TradingPair[] {
    if (!pairs || !Array.isArray(pairs)) {
      console.warn('filterAndSortPairs received invalid pairs data:', pairs);
      return [];
    }

    return pairs
      .filter((pair) => {
        return (
          pair &&
          pair.status === 'TRADING' &&
          pair.isSpotTradingAllowed === true
        );
      })
      .sort((a, b) => {
        if (!a || !b) return 0;
        if (!a.quoteAsset || !b.quoteAsset) return 0;

        if (a.quoteAsset === 'USDT' && b.quoteAsset !== 'USDT') return -1;
        if (b.quoteAsset === 'USDT' && a.quoteAsset !== 'USDT') return 1;

        if (!a.symbol || !b.symbol) return 0;
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
    console.error(message, error);
    return throwError(() => new Error(errorMessage));
  }
}
