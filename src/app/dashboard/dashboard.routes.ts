import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard.component';
import { TradingChartComponent } from './pages/trading-chart/trading-chart.component';
import { PortfolioComponent } from './pages/portfolio/portfolio.component';
import { HistoryComponent } from './pages/history/history.component';
import { authGuard } from '../core/guards/auth.guard';

export const dashboardRoutes: Routes = [
  {
    path: '',
    component: DashboardComponent,
    children: [
      {
        path: '',
        component: TradingChartComponent,
        canActivate: [authGuard],
      },
      {
        path: 'trading',
        component: TradingChartComponent,
        canActivate: [authGuard],
      },
      {
        path: 'portfolio',
        component: PortfolioComponent,
        canActivate: [authGuard],
      },
      {
        path: 'history',
        component: HistoryComponent,
        canActivate: [authGuard],
      },
    ],
  },
];
