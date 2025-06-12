import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MarketWatchComponent } from '../../components/market-watch/market-watch.component';
import { OrderBookComponent } from '../../components/order-book/order-book.component';
import { TradingFormComponent } from '../../components/trading-form/trading-form.component';
import { ChartComponent } from '../../components/chart/chart.component';

@Component({
  selector: 'app-trading-chart',
  standalone: true,
  imports: [
    CommonModule,
    MarketWatchComponent,
    OrderBookComponent,
    ChartComponent,
    TradingFormComponent
  ],
  templateUrl: './trading-chart.component.html',
  styleUrls: ['./trading-chart.component.scss']
})
export class TradingChartComponent {
  // This component is n ow just a layout container
  // All functionality is handled independently by child components
}
