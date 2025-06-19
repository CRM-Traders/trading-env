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

  public readonly tradingPairs$ = this.tradingPairsSubject.asObservable();
  public readonly selectedPair$ = this.selectedPairSubject.asObservable();
  public readonly loading$ = this.loadingSubject.asObservable();
  public readonly error$ = this.errorSubject.asObservable();

  private tradingPairsCache$?: Observable<TradingPair[]>;

  constructor() {
    this.initializeDefaultPair();
  }

  public fetchTradingPairs(): Observable<TradingPair[]> {
    if (!this.tradingPairsCache$) {
      this.loadingSubject.next(true);
      this.errorSubject.next(null);

      this.tradingPairsCache$ = this.httpService
        .get<TradingPair[]>('binance/api/binance/trading-pairs')
        .pipe(
          map((pairs) => this.filterAndSortPairs(pairs)),
          shareReplay(1),
          catchError((error) =>
            this.handleError('Failed to fetch trading pairs', error)
          )
        );

      this.tradingPairsCache$.subscribe({
        next: (pairs) => {
          this.tradingPairsSubject.next(pairs);
          this.loadingSubject.next(false);

          if (!this.selectedPairSubject.value && pairs.length > 0) {
            const defaultPair =
              pairs.find((p) => p.symbol === 'BTCUSDT') || pairs[0];
            this.setSelectedPair(defaultPair);
          }
        },
        error: (error) => {
          this.loadingSubject.next(false);
          this.errorSubject.next(error);
        },
      });
    }

    return this.tradingPairsCache$;
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

  public searchPairs(query: string): TradingPair[] {
    const currentPairs = this.tradingPairsSubject.value;
    if (!query.trim()) {
      return currentPairs;
    }

    const searchTerm = query.toLowerCase().trim();
    return currentPairs.filter(
      (pair) =>
        pair.symbol.toLowerCase().includes(searchTerm) ||
        pair.baseAsset.toLowerCase().includes(searchTerm) ||
        pair.quoteAsset.toLowerCase().includes(searchTerm)
    );
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

  public refreshTradingPairs(): Observable<TradingPair[]> {
    this.tradingPairsCache$ = undefined;
    return this.fetchTradingPairs();
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
    console.error(message, error);
    const errorMessage = error?.error?.message || error?.message || message;
    this.errorSubject.next(errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}
