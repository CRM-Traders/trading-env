import { Routes } from '@angular/router';
import { ErrorComponent } from './shared/error/error.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () =>
      import('./dashboard/dashboard.routes').then((m) => m.dashboardRoutes),
    canActivate: [authGuard],
  },
  {
    path: 'auth/confirm/:authKey',
    loadComponent: () =>
      import('./shared/components/confirm-auth/confirm-auth.component').then(
        (m) => m.ConfirmAuthComponent
      ),
  },
  {
    path: '404',
    component: ErrorComponent,
    data: {
      errorCode: '404',
      errorMessage: 'Page Not Found',
      errorDescription:
        "The trading opportunity you're looking for seems to have moved to a different market.",
    },
  },
  {
    path: '500',
    component: ErrorComponent,
    data: {
      errorCode: '500',
      errorMessage: 'Server Error',
      errorDescription:
        'Our trading servers are experiencing technical difficulties. Please try again in a moment.',
    },
  },
  {
    path: '403',
    component: ErrorComponent,
    data: {
      errorCode: '403',
      errorMessage: 'Access Denied',
      errorDescription:
        "You don't have permission to access this trading resource.",
    },
  },
  { path: '**', redirectTo: '/404' },
];
