import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

export const authGuard: CanActivateFn = (): boolean => {
  const authService = inject(AuthService);

  if (authService.isAuthenticated()) {
    return true;
  }

  window.location.href = environment.redirectUrl;

  return false;
};
