import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard.component';
import { TradingChartComponent } from './pages/trading-chart/trading-chart.component';
import { PortfolioComponent } from './pages/portfolio/portfolio.component';
import { HistoryComponent } from './pages/history/history.component';

export const dashboardRoutes: Routes = [
  {
    path: '',
    component: DashboardComponent,
    children: [
      {
        path: '',
        component: TradingChartComponent,
      },
      {
        path: 'trading',
        component: TradingChartComponent,
      },
      {
        path: 'portfolio',
        component: PortfolioComponent,
      },
      {
        path: 'history',
        component: HistoryComponent,
      },
    ],
  }
];
