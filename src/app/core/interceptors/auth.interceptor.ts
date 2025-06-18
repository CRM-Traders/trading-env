import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpEvent,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError, catchError, switchMap, of } from 'rxjs';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

const getTokenFromStorage = (key: string): string | null => {
  return localStorage.getItem(key);
};

export const authInterceptor: HttpInterceptorFn = (
  request: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const router = inject(Router);

  const userAgent = window.navigator.userAgent;

  if (shouldSkipAuth(request)) {
    return next(request);
  }

  const authToken = getTokenFromStorage('KwmSJaWnWhcdYGciaclPyeqySdQE6qCd');

  if (authToken) {
    request = addTokenToRequest(request, authToken, userAgent);
  }

  return next(request).pipe(
    catchError((error) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        router.navigateByUrl(environment.redirectUrl);
      }
      return throwError(() => error);
    })
  );
};

function addTokenToRequest(
  request: HttpRequest<any>,
  token: string,
  userAgent: string
): HttpRequest<any> {
  const browser = detectBrowser(userAgent);
  const os = detectOS(userAgent);
  const device = detectDevice(userAgent);

  return request.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`,
      'X-Client-Device': device || 'unknown',
      'X-Client-OS': os || 'unknown',
      'X-Client-Browser': browser || 'unknown',
    },
  });
}

function detectBrowser(ua: string): string {
  if (ua.indexOf('Chrome') > -1) return 'Chrome';
  if (ua.indexOf('Firefox') > -1) return 'Firefox';
  if (ua.indexOf('Safari') > -1) return 'Safari';
  if (ua.indexOf('Edge') > -1) return 'Edge';
  if (ua.indexOf('MSIE') > -1 || ua.indexOf('Trident/') > -1)
    return 'Internet Explorer';
  return 'Unknown';
}

function detectOS(ua: string): string {
  if (ua.indexOf('Windows') > -1) return 'Windows';
  if (ua.indexOf('Mac') > -1) return 'MacOS';
  if (ua.indexOf('Linux') > -1) return 'Linux';
  if (ua.indexOf('Android') > -1) return 'Android';
  if (
    ua.indexOf('iOS') > -1 ||
    ua.indexOf('iPhone') > -1 ||
    ua.indexOf('iPad') > -1
  )
    return 'iOS';
  return 'Unknown';
}

function detectDevice(ua: string): string {
  if (ua.indexOf('Mobile') > -1) return 'Mobile';
  if (ua.indexOf('Tablet') > -1) return 'Tablet';
  return 'Desktop';
}

function shouldSkipAuth(request: HttpRequest<unknown>): boolean {
  const apiUrl = environment.gatewayDomain;

  if (!request.url.includes(apiUrl)) {
    return true;
  }

  const authEndpoints = ['auth/refresh-token'];
  return authEndpoints.some((endpoint) => request.url.includes(endpoint));
}
