import { Injectable, OnDestroy, inject } from '@angular/core';
import {
  Observable,
  Subject,
  BehaviorSubject,
  fromEvent,
  throwError,
} from 'rxjs';
import {
  map,
  filter,
  catchError,
  takeUntil,
  distinctUntilChanged,
} from 'rxjs/operators';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../../environments/environment';

export interface WebSocketTickerData {
  eventType: string;
  eventTime: number;
  symbol: string;
  priceChange: number;
  priceChangePercent: number;
  weightedAvgPrice: number;
  firstTradePrice: number;
  lastPrice: number;
  lastQuantity: number;
  bestBidPrice: number;
  bestBidQuantity: number;
  bestAskPrice: number;
  bestAskQuantity: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  totalTradedBaseAssetVolume: number;
  totalTradedQuoteAssetVolume: number;
  statisticsOpenTime: number;
  statisticsCloseTime: number;
  firstTradeId: number;
  lastTradeId: number;
  totalNumberOfTrades: number;
}

export interface TradeData {
  eventType: string;
  eventTime: number;
  symbol: string;
  tradeId: number;
  price: number;
  quantity: number;
  buyerOrderId: number;
  sellerOrderId: number;
  tradeTime: number;
  isBuyerMarketMaker: boolean;
}

export interface ChartDataPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export enum ConnectionState {
  Disconnected = 'Disconnected',
  Connecting = 'Connecting',
  Connected = 'Connected',
  Reconnecting = 'Reconnecting',
  Error = 'Error',
}

@Injectable({
  providedIn: 'root',
})
export class SignalRService implements OnDestroy {
  private connection: signalR.HubConnection | null = null;
  private readonly destroy$ = new Subject<void>();

  // Connection state management
  private readonly connectionStateSubject =
    new BehaviorSubject<ConnectionState>(ConnectionState.Disconnected);
  public readonly connectionState$ = this.connectionStateSubject.asObservable();

  // Data streams
  private readonly tickerDataSubject = new Subject<WebSocketTickerData>();
  private readonly tradeDataSubject = new Subject<TradeData>();
  private readonly chartDataSubject = new Subject<ChartDataPoint>();
  private readonly errorSubject = new Subject<string>();

  public readonly tickerData$ = this.tickerDataSubject.asObservable();
  public readonly tradeData$ = this.tradeDataSubject.asObservable();
  public readonly chartData$ = this.chartDataSubject.asObservable();
  public readonly error$ = this.errorSubject.asObservable();

  // Track active subscriptions
  private activeTickerSubscriptions = new Set<string>();
  private activeTradeSubscriptions = new Set<string>();

  private readonly hubUrl = `${environment.socketDomain}/binanceHub`;

  constructor() {
    this.initializeConnection();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.disconnect();
  }

  /**
   * Initialize SignalR connection with proper configuration
   */
  private initializeConnection(): void {
    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(this.hubUrl, {
        withCredentials: false,
        transport:
          signalR.HttpTransportType.WebSockets |
          signalR.HttpTransportType.LongPolling,
      })
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (retryContext) => {
          // Exponential backoff: 2s, 4s, 8s, 16s, then 30s max
          const delay = Math.min(
            1000 * Math.pow(2, retryContext.previousRetryCount),
            30000
          );
          console.log(
            `Reconnection attempt ${
              retryContext.previousRetryCount + 1
            } in ${delay}ms`
          );
          return delay;
        },
      })
      .configureLogging(signalR.LogLevel.Information)
      .build();

    this.setupConnectionEventHandlers();
    this.setupDataEventHandlers();
  }

  /**
   * Setup connection state event handlers
   */
  private setupConnectionEventHandlers(): void {
    if (!this.connection) return;

    this.connection.onclose((error) => {
      console.warn('SignalR connection closed', error);
      this.connectionStateSubject.next(ConnectionState.Disconnected);
      this.activeTickerSubscriptions.clear();
      this.activeTradeSubscriptions.clear();

      if (error) {
        this.errorSubject.next(`Connection closed: ${error.message}`);
      }
    });

    this.connection.onreconnecting((error) => {
      console.warn('SignalR reconnecting', error);
      this.connectionStateSubject.next(ConnectionState.Reconnecting);
    });

    this.connection.onreconnected((connectionId) => {
      console.log('SignalR reconnected', connectionId);
      this.connectionStateSubject.next(ConnectionState.Connected);
      // Resubscribe to active subscriptions
      this.resubscribeToActiveStreams();
    });
  }

  /**
   * Setup data event handlers from the hub
   */
  private setupDataEventHandlers(): void {
    if (!this.connection) return;

    // Ticker data updates
    this.connection.on('TickerUpdate', (data: WebSocketTickerData) => {
      this.tickerDataSubject.next(data);
      this.processTickerDataForChart(data);
    });

    // Trade data updates
    this.connection.on('TradeUpdate', (data: TradeData) => {
      this.tradeDataSubject.next(data);
    });

    // Subscription confirmations
    this.connection.on(
      'SubscriptionConfirmed',
      (data: { type: string; symbol: string }) => {
        console.log(`Subscription confirmed: ${data.type} for ${data.symbol}`);
      }
    );

    // Subscription errors
    this.connection.on(
      'SubscriptionError',
      (data: { type: string; symbol: string; error: string }) => {
        console.error(
          `Subscription error: ${data.type} for ${data.symbol}`,
          data.error
        );
        this.errorSubject.next(
          `Failed to subscribe to ${data.type} for ${data.symbol}: ${data.error}`
        );
      }
    );

    // Unsubscription confirmations
    this.connection.on(
      'UnsubscriptionConfirmed',
      (data: { type: string; symbol: string }) => {
        console.log(
          `Unsubscription confirmed: ${data.type} for ${data.symbol}`
        );
      }
    );
  }

  /**
   * Connect to the SignalR hub
   */
  public async connect(): Promise<void> {
    if (
      !this.connection ||
      this.connection.state !== signalR.HubConnectionState.Disconnected
    ) {
      return;
    }

    try {
      this.connectionStateSubject.next(ConnectionState.Connecting);
      await this.connection.start();
      this.connectionStateSubject.next(ConnectionState.Connected);
      console.log('SignalR connection established');
    } catch (error) {
      console.error('Failed to start SignalR connection', error);
      this.connectionStateSubject.next(ConnectionState.Error);
      this.errorSubject.next(
        `Failed to connect: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      throw error;
    }
  }

  /**
   * Disconnect from the SignalR hub
   */
  public async disconnect(): Promise<void> {
    if (!this.connection) return;

    try {
      await this.connection.stop();
      console.log('SignalR connection stopped');
    } catch (error) {
      console.error('Error stopping SignalR connection', error);
    }
  }

  /**
   * Subscribe to ticker data for a specific symbol
   */
  public async subscribeToTicker(symbol: string): Promise<void> {
    await this.ensureConnected();

    if (this.activeTickerSubscriptions.has(symbol)) {
      console.log(`Already subscribed to ticker for ${symbol}`);
      return;
    }

    try {
      await this.connection!.invoke('SubscribeToTicker', symbol);
      this.activeTickerSubscriptions.add(symbol);
      console.log(`Subscribed to ticker for ${symbol}`);
    } catch (error) {
      console.error(`Failed to subscribe to ticker for ${symbol}`, error);
      this.errorSubject.next(`Failed to subscribe to ticker for ${symbol}`);
      throw error;
    }
  }

  /**
   * Unsubscribe from ticker data for a specific symbol
   */
  public async unsubscribeFromTicker(symbol: string): Promise<void> {
    if (
      !this.connection ||
      this.connection.state !== signalR.HubConnectionState.Connected
    ) {
      this.activeTickerSubscriptions.delete(symbol);
      return;
    }

    try {
      await this.connection.invoke('UnsubscribeFromTicker', symbol);
      this.activeTickerSubscriptions.delete(symbol);
      console.log(`Unsubscribed from ticker for ${symbol}`);
    } catch (error) {
      console.error(`Failed to unsubscribe from ticker for ${symbol}`, error);
    }
  }

  /**
   * Subscribe to trade data for a specific symbol
   */
  public async subscribeToTrades(symbol: string): Promise<void> {
    await this.ensureConnected();

    if (this.activeTradeSubscriptions.has(symbol)) {
      console.log(`Already subscribed to trades for ${symbol}`);
      return;
    }

    try {
      await this.connection!.invoke('SubscribeToTrades', symbol);
      this.activeTradeSubscriptions.add(symbol);
      console.log(`Subscribed to trades for ${symbol}`);
    } catch (error) {
      console.error(`Failed to subscribe to trades for ${symbol}`, error);
      this.errorSubject.next(`Failed to subscribe to trades for ${symbol}`);
      throw error;
    }
  }

  /**
   * Unsubscribe from trade data for a specific symbol
   */
  public async unsubscribeFromTrades(symbol: string): Promise<void> {
    if (
      !this.connection ||
      this.connection.state !== signalR.HubConnectionState.Connected
    ) {
      this.activeTradeSubscriptions.delete(symbol);
      return;
    }

    try {
      await this.connection.invoke('UnsubscribeFromTrades', symbol);
      this.activeTradeSubscriptions.delete(symbol);
      console.log(`Unsubscribed from trades for ${symbol}`);
    } catch (error) {
      console.error(`Failed to unsubscribe from trades for ${symbol}`, error);
    }
  }

  /**
   * Get ticker data for a specific symbol
   */
  public getTickerDataForSymbol(
    symbol: string
  ): Observable<WebSocketTickerData> {
    return this.tickerData$.pipe(
      filter((data) => data.symbol === symbol),
      distinctUntilChanged((prev, curr) => prev.lastPrice === curr.lastPrice),
      takeUntil(this.destroy$)
    );
  }

  /**
   * Get trade data for a specific symbol
   */
  public getTradeDataForSymbol(symbol: string): Observable<TradeData> {
    return this.tradeData$.pipe(
      filter((data) => data.symbol === symbol),
      takeUntil(this.destroy$)
    );
  }

  /**
   * Get chart data for a specific symbol
   */
  public getChartDataForSymbol(symbol: string): Observable<ChartDataPoint> {
    return this.chartData$.pipe(
      filter((data) => data.time > 0), // Ensure valid data
      takeUntil(this.destroy$)
    );
  }

  /**
   * Check if connected and connect if necessary
   */
  private async ensureConnected(): Promise<void> {
    if (!this.connection) {
      this.initializeConnection();
    }

    if (this.connection!.state === signalR.HubConnectionState.Disconnected) {
      await this.connect();
    }
  }

  /**
   * Resubscribe to all active streams after reconnection
   */
  private async resubscribeToActiveStreams(): Promise<void> {
    const tickerPromises = Array.from(this.activeTickerSubscriptions).map(
      (symbol) =>
        this.connection!.invoke('SubscribeToTicker', symbol).catch((error) =>
          console.error(`Failed to resubscribe to ticker for ${symbol}`, error)
        )
    );

    const tradePromises = Array.from(this.activeTradeSubscriptions).map(
      (symbol) =>
        this.connection!.invoke('SubscribeToTrades', symbol).catch((error) =>
          console.error(`Failed to resubscribe to trades for ${symbol}`, error)
        )
    );

    await Promise.all([...tickerPromises, ...tradePromises]);
    console.log('Resubscribed to all active streams');
  }

  /**
   * Process ticker data to create chart data points
   */
  private processTickerDataForChart(tickerData: WebSocketTickerData): void {
    // Create a simplified chart data point from ticker data
    // In a real application, you might want to aggregate this data over time intervals
    const chartPoint: ChartDataPoint = {
      time: Math.floor(tickerData.eventTime / 1000), // Convert to seconds
      open: tickerData.openPrice,
      high: tickerData.highPrice,
      low: tickerData.lowPrice,
      close: tickerData.lastPrice,
      volume: tickerData.totalTradedBaseAssetVolume,
    };

    this.chartDataSubject.next(chartPoint);
  }

  /**
   * Get current connection state
   */
  public getConnectionState(): ConnectionState {
    return this.connectionStateSubject.value;
  }

  /**
   * Check if currently connected
   */
  public isConnected(): boolean {
    return this.connectionStateSubject.value === ConnectionState.Connected;
  }

  /**
   * Get active subscriptions info
   */
  public getActiveSubscriptions(): { tickers: string[]; trades: string[] } {
    return {
      tickers: Array.from(this.activeTickerSubscriptions),
      trades: Array.from(this.activeTradeSubscriptions),
    };
  }
}
