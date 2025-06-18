import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
} from '@angular/common/http';
import { environment } from '../../../environments/environment';

export const securityHeadersInterceptor: HttpInterceptorFn = (
  request: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  if (!request.url.includes(environment.gatewayDomain)) {
    return next(request);
  }

  const secureRequest = request.clone({
    setHeaders: {
      'X-Content-Type-Options': 'nosniff',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'X-XSS-Protection': '1; mode=block',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy':
        'camera=(), microphone=(), geolocation=(self), payment=()',
    },
  });

  return next(secureRequest);
};
