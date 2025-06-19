import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HttpService } from './http.service';
import {
  BehaviorSubject,
  catchError,
  filter,
  interval,
  Observable,
  of,
  Subscription,
  switchMap,
  take,
  tap,
  throwError,
} from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse } from '../models/auth-response.model';

@Injectable({
  providedIn: 'root',
})
export class AuthService implements OnDestroy {
  private _http = inject(HttpService);
  private _router = inject(Router);

  private readonly ACCESS_TOKEN_KEY = 'KwmSJaWnWhcdYGciaclPyeqySdQE6qCd';
  private readonly REFRESH_TOKEN_KEY = 'MWKAjsgh340gDciGr69MQpPwpEdvPj9M';
  private readonly ROLE_KEY = 'MMi201smI03hbuMtl9tR1TjbOFGWf54p';
  private readonly EXPIRATION_KEY = 'maJSbahwka2SpZQbb6cDLueVAAs0WtRjs';
  private readonly NAME_KEY = '71a52semMKLciaSpZQbb6cDLueVAAs0WtRjs';

  private refreshTokenInProgress = false;
  private refreshTokenSubject = new BehaviorSubject<string | null>(null);
  private tokenCheckInterval: Subscription | null = null;

  private readonly _isAuthenticated = signal<boolean>(this.hasValidToken());
  private readonly _userRole = signal<string>(this.getRole());

  readonly isAuthenticated = this._isAuthenticated.asReadonly();
  readonly userRole = this._userRole.asReadonly();

  constructor() {
    this.initTokenRefresh();
  }

  ngOnDestroy(): void {
    this.stopTokenCheck();
  }

  logout(): void {
    this.stopTokenCheck();
    this.clearAuthState();
  }

  redirectToCRM() {
    this._router.navigateByUrl(environment.redirectUrl);
  }

  private clearAuthState(): void {
    this.clearAuthData();
    this._isAuthenticated.set(false);
    this._userRole.set('');
    this.redirectToCRM();
  }

  refreshToken(): Observable<AuthResponse> {
    const refreshToken = this.getRefreshToken();
    const accessToken = this.getAccessToken();

    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available'));
    }

    if (this.refreshTokenInProgress) {
      return this.refreshTokenSubject.pipe(
        filter((token) => token !== null),
        take(1),
        switchMap(() =>
          of({
            accessToken: this.getAccessToken() || '',
            refreshToken: this.getRefreshToken() || '',
            role: this.getRole(),
            exp: this.getTokenExpiration(),
          } as AuthResponse)
        )
      );
    }

    this.refreshTokenInProgress = true;
    this.refreshTokenSubject.next(null);

    const body = { accessToken: accessToken, refreshToken: refreshToken };

    return this._http
      .post<AuthResponse>('identity/api/auth/refresh-token', body)
      .pipe(
        tap((response) => {
          this.handleAuthResponse(response);
          this.refreshTokenInProgress = false;
          this.refreshTokenSubject.next(response.accessToken);
        }),
        catchError((error) => {
          this.refreshTokenInProgress = false;
          this.refreshTokenSubject.next(null);
          this.clearAuthState();
          return throwError(
            () => new Error('Session expired. Please log in again.')
          );
        })
      );
  }

  confirmAuth(authKey: string): Observable<AuthResponse> {
    return this._http
      .get<AuthResponse>(`identity/api/auth/confirm-auth?authKey=${authKey}`)
      .pipe(
        tap((response) => {
          this.handleAuthResponse(response);
          this.initTokenRefresh();
        }),
        catchError((error) =>
          throwError(() => new Error('Authentication token validation failed.'))
        )
      );
  }

  hasRole(requiredRole: string): boolean {
    const userRole = this.getRole();
    return userRole === requiredRole;
  }

  getAccessToken(): string | null {
    return localStorage.getItem(this.ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  getRole(): string {
    return localStorage.getItem(this.ROLE_KEY) || '';
  }

  getName(): string {
    return localStorage.getItem(this.NAME_KEY) || '';
  }

  getTokenExpiration(): number {
    const expString = localStorage.getItem(this.EXPIRATION_KEY);
    return expString ? parseInt(expString, 10) : 0;
  }

  hasValidToken(): boolean {
    const token = this.getAccessToken();
    if (!token) return false;

    try {
      const expTime = this.getTokenExpiration();
      const currentTime = Math.floor(Date.now() / 1000);
      return expTime > currentTime;
    } catch (error) {
      return false;
    }
  }

  private handleAuthResponse(response: AuthResponse): void {
    if (response && response.accessToken) {
      this.storeAuthData(response);
      this._isAuthenticated.set(true);
      this._userRole.set(response.role);
    }
  }

  private storeAuthData(authData: AuthResponse): void {
    localStorage.setItem(this.ACCESS_TOKEN_KEY, authData.accessToken);
    localStorage.setItem(this.REFRESH_TOKEN_KEY, authData.refreshToken);
    localStorage.setItem(this.ROLE_KEY, authData.role);
    localStorage.setItem(this.EXPIRATION_KEY, `${authData.exp}`);
    localStorage.setItem(this.NAME_KEY, authData.name);
  }

  private clearAuthData(): void {
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.ROLE_KEY);
    localStorage.removeItem(this.EXPIRATION_KEY);
    localStorage.removeItem(this.NAME_KEY);
  }

  private initTokenRefresh(): void {
    this.stopTokenCheck();

    if (this.hasValidToken()) {
      this.tokenCheckInterval = interval(30000).subscribe(() => {
        this.checkAndRefreshToken();
      });

      this.checkAndRefreshToken();
    }
  }

  private stopTokenCheck(): void {
    if (this.tokenCheckInterval) {
      this.tokenCheckInterval.unsubscribe();
      this.tokenCheckInterval = null;
    }
  }

  private checkAndRefreshToken(): void {
    if (!this.hasValidToken()) {
      this.refreshToken().subscribe();
      return;
    }

    const expTime = this.getTokenExpiration();
    const currentTime = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = expTime - currentTime;

    const totalTokenLifetime = 300;

    const refreshThreshold = totalTokenLifetime * 0.25;

    if (timeUntilExpiry < refreshThreshold) {
      this.refreshToken().subscribe();
    }
  }
}
