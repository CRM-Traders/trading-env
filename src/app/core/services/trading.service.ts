import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, map, retry } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { HttpService } from './http.service';

export interface CreateOrderRequest {
  tradingAccountId: string;
  symbol: string;
  orderType: 'Market' | 'Limit';
  side: 'Buy' | 'Sell';
  quantity: number;
  price?: number;
}

export interface OrderResponse {
  id: string;
  tradingPairSymbol: string;
  orderType: string;
  side: string;
  price: number;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  status: string;
  createdAt: string;
}

export interface PagedResult<T> {
  items: T[];
  pageIndex: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

// New interface for open orders
export interface OpenOrder {
  id: string;
  tradingPairSymbol: string;
  orderType: string;
  side: string;
  price: number;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  status: string;
  createdAt: Date;
  progressPercentage: number;
}

@Injectable({
  providedIn: 'root',
})
export class TradingService {
  private readonly http = inject(HttpService);
  private readonly baseUrl = `${environment.gatewayDomain}/api/trading`;

  private readonly ordersSubject = new BehaviorSubject<OrderResponse[]>([]);
  private readonly openOrdersSubject = new BehaviorSubject<OpenOrder[]>([]);

  public readonly orders$ = this.ordersSubject.asObservable();
  public readonly openOrders$ = this.openOrdersSubject.asObservable();

  /**
   * Create a new spot trading order
   */
  createOrder(request: CreateOrderRequest): Observable<string> {
    return this.http
      .post<string>(`${this.baseUrl}/order`, request)
      .pipe(retry(1), catchError(this.handleError));
  }

  /**
   * Create a market buy order
   */
  createMarketBuyOrder(
    tradingAccountId: string,
    symbol: string,
    quantity: number
  ): Observable<string> {
    const request = {
      tradingAccountId,
      symbol,
      side: 'Buy' as const,
      quantity,
    };

    return this.http
      .post<string>(`${this.baseUrl}/order/market`, request)
      .pipe(retry(1), catchError(this.handleError));
  }

  /**
   * Create a market sell order
   */
  createMarketSellOrder(
    tradingAccountId: string,
    symbol: string,
    quantity: number
  ): Observable<string> {
    const request = {
      tradingAccountId,
      symbol,
      side: 'Sell' as const,
      quantity,
    };

    return this.http
      .post<string>(`${this.baseUrl}/order/market`, request)
      .pipe(retry(1), catchError(this.handleError));
  }

  /**
   * Create a limit order
   */
  createLimitOrder(
    tradingAccountId: string,
    symbol: string,
    side: 'Buy' | 'Sell',
    quantity: number,
    price: number
  ): Observable<string> {
    const request = {
      tradingAccountId,
      symbol,
      side,
      quantity,
      price,
    };

    return this.http
      .post<string>(`${this.baseUrl}/order/limit`, request)
      .pipe(retry(1), catchError(this.handleError));
  }

  /**
   * Get orders for a trading account
   */
  getOrders(
    tradingAccountId: string,
    status?: string,
    symbol?: string,
    pageIndex: number = 1,
    pageSize: number = 50
  ): Observable<PagedResult<OrderResponse>> {
    const params: any = {
      pageIndex: pageIndex.toString(),
      pageSize: pageSize.toString(),
    };

    if (status) params.status = status;
    if (symbol) params.symbol = symbol;

    return this.http
      .get<PagedResult<OrderResponse>>(
        `${this.baseUrl}/orders/${tradingAccountId}`,
        params
      )
      .pipe(
        map((result) => {
          this.ordersSubject.next(result.items);
          return result;
        }),
        catchError(this.handleError)
      );
  }

  /**
   * Get open orders for a trading account (NEW ENDPOINT)
   */
  getOpenOrders(
    tradingAccountId: string,
    pageIndex: number = 1,
    pageSize: number = 20
  ): Observable<PagedResult<OpenOrder>> {
    const params = {
      pageIndex: pageIndex.toString(),
      pageSize: pageSize.toString(),
    };

    return this.http
      .get<PagedResult<OrderResponse>>(
        `${this.baseUrl}/orders/${tradingAccountId}?pageSize=${pageSize}&pageIndex=${pageIndex}`
      )
      .pipe(
        map((result) => {
          const openOrders = result.items
            .filter((order) =>
              ['Pending', 'PartiallyFilled', 'Open'].includes(order.status)
            )
            .map(this.mapToOpenOrder);

          this.openOrdersSubject.next(openOrders);

          return {
            ...result,
            items: openOrders,
          };
        }),
        catchError(this.handleError)
      );
  }

  /**
   * Cancel an order
   */
  cancelOrder(orderId: string): Observable<void> {
    return this.http
      .delete<void>(`${this.baseUrl}/order/${orderId}`)
      .pipe(retry(1), catchError(this.handleError));
  }

  /**
   * Map OrderResponse to OpenOrder with additional calculated fields
   */
  private mapToOpenOrder(order: OrderResponse): OpenOrder {
    const progressPercentage =
      order.quantity > 0 ? (order.filledQuantity / order.quantity) * 100 : 0;

    return {
      id: order.id,
      tradingPairSymbol: order.tradingPairSymbol,
      orderType: order.orderType,
      side: order.side,
      price: order.price,
      quantity: order.quantity,
      filledQuantity: order.filledQuantity,
      remainingQuantity: order.remainingQuantity,
      status: order.status,
      createdAt: new Date(order.createdAt),
      progressPercentage,
    };
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An unexpected error occurred';

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = error.error.message;
    } else {
      // Server-side error
      switch (error.status) {
        case 400:
          errorMessage = error.error?.detail || 'Invalid request';
          break;
        case 401:
          errorMessage = 'Authentication required';
          break;
        case 403:
          errorMessage = 'Insufficient permissions';
          break;
        case 404:
          errorMessage = 'Resource not found';
          break;
        case 409:
          errorMessage = 'Conflict - resource already exists';
          break;
        case 500:
          errorMessage = 'Internal server error';
          break;
        default:
          errorMessage = `Error: ${error.status} - ${
            error.error?.detail || error.message
          }`;
      }
    }

    console.error('Trading Service Error:', error);
    return throwError(() => new Error(errorMessage));
  }
}
