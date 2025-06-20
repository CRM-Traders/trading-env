import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@microsoft/signalr';
import {
  BehaviorSubject,
  Observable,
  map,
  catchError,
  retry,
  throwError,
} from 'rxjs';
import { environment } from '../../../environments/environment';
import { HttpService } from './http.service';

export interface WalletBalance {
  id: string;
  currency: string;
  availableBalance: number;
  lockedBalance: number;
  totalBalance: number;
  usdEquivalent: number;
  lastPriceUpdate: string;
}

@Injectable({
  providedIn: 'root',
})
export class WalletService {
  private readonly http = inject(HttpService);
  private readonly baseUrl = `traiding/api/wallets`;

  private readonly balancesSubject = new BehaviorSubject<WalletBalance[]>([]);
  public readonly balances$ = this.balancesSubject.asObservable();

  /**
   * Get wallet balances for a trading account
   */
  getWallets(tradingAccountId: string): Observable<WalletBalance[]> {
    return this.http
      .get<WalletBalance[]>(`${this.baseUrl}/${tradingAccountId}`)
      .pipe(
        map((balances) => {
          this.balancesSubject.next(balances);
          return balances;
        }),
        catchError(this.handleError)
      );
  }

  getPortfolio() {
    return this.http.get(`${this.baseUrl}/portfolio`);
  }

  /**
   * Get balance for a specific currency
   */
  getBalance(
    tradingAccountId: string,
    currency: string
  ): Observable<WalletBalance | null> {
    return this.getWallets(tradingAccountId).pipe(
      map((balances) => balances.find((b) => b.currency === currency) || null)
    );
  }

  /**
   * Deposit funds
   */
  deposit(
    tradingAccountId: string,
    currency: string,
    amount: number
  ): Observable<void> {
    return this.http
      .post<void>(`${this.baseUrl}/deposit`, {
        tradingAccountId,
        currency,
        amount,
      })
      .pipe(retry(1), catchError(this.handleError));
  }

  /**
   * Withdraw funds
   */
  withdraw(
    tradingAccountId: string,
    currency: string,
    amount: number
  ): Observable<void> {
    return this.http
      .post<void>(`${this.baseUrl}/withdraw`, {
        tradingAccountId,
        currency,
        amount,
      })
      .pipe(retry(1), catchError(this.handleError));
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
        case 404:
          errorMessage = 'Wallet not found';
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
