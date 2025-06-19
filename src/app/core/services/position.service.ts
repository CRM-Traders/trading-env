import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  BehaviorSubject,
  Observable,
  retry,
  catchError,
  map,
  throwError,
} from 'rxjs';
import { environment } from '../../../environments/environment';
import { HttpService } from './http.service';

export interface Position {
  id: string;
  symbol: string;
  side: 'Long' | 'Short';
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercentage: number;
  leverage: number;
  margin: number;
  liquidationPrice: number;
  status: string;
  openedAt: Date;
  stopLoss?: number;
  takeProfit?: number;
}

export interface CreateOrderRequest {
  tradingAccountId: string;
  symbol: string;
  orderType: 'Market' | 'Limit';
  side: 'Buy' | 'Sell';
  quantity: number;
  price?: number;
}

export interface CreatePositionRequest {
  tradingAccountId: string;
  symbol: string;
  side: 'Long' | 'Short';
  quantity: number;
  leverage: number;
  stopLoss?: number;
  takeProfit?: number;
}

export type TradingMode = 'spot' | 'cross';
export type OrderSide = 'buy' | 'sell';

@Injectable({
  providedIn: 'root',
})
export class PositionService {
  private readonly http = inject(HttpService);
  private readonly baseUrl = `${environment.gatewayDomain}/traiding/api/futures`;

  private readonly positionsSubject = new BehaviorSubject<Position[]>([]);
  public readonly positions$ = this.positionsSubject.asObservable();

  openPosition(request: CreatePositionRequest): Observable<string> {
    return this.http
      .post<string>(`${this.baseUrl}/position`, request)
      .pipe(retry(1), catchError(this.handleError));
  }

  getPositions(
    tradingAccountId?: string,
    status?: string
  ): Observable<Position[]> {
    const accountId = tradingAccountId || this.getCurrentTradingAccountId();

    const params: any = {};
    if (status) params.status = status;

    return this.http
      .get<Position[]>(`${this.baseUrl}/positions/${accountId}`, params)
      .pipe(
        map((positions) => {
          const mappedPositions = positions.map(this.mapPositionResponse);
          this.positionsSubject.next(mappedPositions);
          return mappedPositions;
        }),
        catchError(this.handleError)
      );
  }

  closePosition(positionId: string): Observable<void> {
    return this.http
      .delete<void>(`${this.baseUrl}/position/${positionId}`)
      .pipe(retry(1), catchError(this.handleError));
  }

  updateStopLoss(positionId: string, stopLossPrice: number): Observable<void> {
    return this.http
      .put<void>(`${this.baseUrl}/position/${positionId}/stop-loss`, {
        stopLossPrice,
      })
      .pipe(retry(1), catchError(this.handleError));
  }

  updateTakeProfit(
    positionId: string,
    takeProfitPrice: number
  ): Observable<void> {
    return this.http
      .put<void>(`${this.baseUrl}/position/${positionId}/take-profit`, {
        takeProfitPrice,
      })
      .pipe(retry(1), catchError(this.handleError));
  }

  private mapPositionResponse(apiPosition: any): Position {
    return {
      id: apiPosition.id,
      symbol: apiPosition.symbol,
      side: apiPosition.side,
      size: apiPosition.quantity,
      entryPrice: apiPosition.entryPrice,
      currentPrice: apiPosition.currentPrice,
      unrealizedPnL: apiPosition.unrealizedPnL,
      unrealizedPnLPercentage: apiPosition.unrealizedPnLPercentage,
      leverage: apiPosition.leverage,
      margin: apiPosition.margin,
      liquidationPrice: apiPosition.liquidationPrice,
      status: apiPosition.status,
      openedAt: new Date(apiPosition.openedAt),
      stopLoss: apiPosition.stopLoss,
      takeProfit: apiPosition.takeProfit,
    };
  }

  private getCurrentTradingAccountId(): string {
    return 'current-trading-account-id';
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An unexpected error occurred';

    if (error.error instanceof ErrorEvent) {
      errorMessage = error.error.message;
    } else {
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
          errorMessage = 'Position not found';
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

    return throwError(() => new Error(errorMessage));
  }
}
