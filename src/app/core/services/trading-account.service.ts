import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@microsoft/signalr';
import { BehaviorSubject, Observable, map, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { HttpService } from './http.service';

export interface TradingAccount {
  id: string;
  userId: string;
  accountNumber: string;
  displayName: string;
  accountType: string;
  status: string;
  initialBalance: number;
  enableSpotTrading: boolean;
  enableFuturesTrading: boolean;
  maxLeverage: number;
  createdAt: string;
  verifiedAt?: string;
  suspendedAt?: string;
  suspensionReason?: string;
}

@Injectable({
  providedIn: 'root',
})
export class TradingAccountService {
  private readonly http = inject(HttpService);
  private readonly baseUrl = `traiding/api/tradingaccounts`;

  private readonly currentAccountSubject =
    new BehaviorSubject<TradingAccount | null>(null);
  public readonly currentAccount$ = this.currentAccountSubject.asObservable();

  getUserAccounts(): Observable<TradingAccount[]> {
    return this.http.get<TradingAccount[]>(`${this.baseUrl}/user`).pipe(
      map((accounts) => {
        if (accounts.length > 0 && !this.currentAccountSubject.value) {
          const activeAccount =
            accounts.find((a) => a.status === 'Active') || accounts[0];
          this.setCurrentAccount(activeAccount);
        }
        return accounts;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get a specific trading account
   */
  getAccount(accountId: string): Observable<TradingAccount> {
    return this.http
      .get<TradingAccount>(`${this.baseUrl}/${accountId}`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Set the current active trading account
   */
  setCurrentAccount(account: TradingAccount): void {
    this.currentAccountSubject.next(account);
    localStorage.setItem('currentTradingAccount', JSON.stringify(account));
  }

  getCurrentAccount(): TradingAccount | null {
    const current = this.currentAccountSubject.value;
    if (current) return current;

    const stored = localStorage.getItem('currentTradingAccount');
    if (stored) {
      const account = JSON.parse(stored);
      this.currentAccountSubject.next(account);
      return account;
    }

    return null;
  }

  getCurrentAccountId(): string | null {
    const account = this.getCurrentAccount();
    return account?.id || null;
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An unexpected error occurred';

    if (error.error instanceof ErrorEvent) {
      errorMessage = error.error.message;
    } else {
      switch (error.status) {
        case 401:
          errorMessage = 'Authentication required';
          break;
        case 403:
          errorMessage = 'Insufficient permissions';
          break;
        case 404:
          errorMessage = 'Trading account not found';
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
