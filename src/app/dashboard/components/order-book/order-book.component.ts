import { CommonModule } from '@angular/common';
import { Component, HostListener } from '@angular/core';

interface OrderBookEntry {
  price: number;
  size: number;
}

interface RecentTrade {
  symbol: string;
  side: 'buy' | 'sell';
  size: number;
  price: number;
  time: string;
}

@Component({
  selector: 'app-order-book',
  imports: [CommonModule],
  templateUrl: './order-book.component.html',
  styleUrl: './order-book.component.scss',
})
export class OrderBookComponent {
  currentOrderView: 'book' | 'trades' = 'book';
  spread = 0.5;
  isDesktop = false;

  orderBook = {
    asks: [
      { price: 44253.5, size: 0.2156 },
      { price: 44253.0, size: 0.9876 },
      { price: 44252.5, size: 2.1567 },
      { price: 44252.0, size: 0.8234 },
      { price: 44251.5, size: 1.2847 },
      { price: 44251.0, size: 0.5421 },
      { price: 44250.75, size: 0.3245 },
      { price: 44250.6, size: 1.5432 },
    ] as OrderBookEntry[],
    bids: [
      { price: 44250.5, size: 0.7234 },
      { price: 44250.0, size: 1.5432 },
      { price: 44249.5, size: 0.6789 },
      { price: 44249.0, size: 2.3456 },
      { price: 44248.5, size: 1.1234 },
      { price: 44248.0, size: 0.8765 },
      { price: 44247.5, size: 1.9876 },
      { price: 44247.0, size: 0.4321 },
    ] as OrderBookEntry[],
  };

  recentTrades: RecentTrade[] = [
    {
      symbol: 'BTCUSD',
      side: 'buy',
      size: 0.25,
      price: 44180.25,
      time: '14:32',
    },
    { symbol: 'ETHUSD', side: 'sell', size: 1.5, price: 2851.4, time: '14:28' },
    { symbol: 'SOLUSD', side: 'buy', size: 5, price: 97.8, time: '14:15' },
    {
      symbol: 'BTCUSD',
      side: 'sell',
      size: 0.1,
      price: 44220.75,
      time: '14:05',
    },
    { symbol: 'ADAUSD', side: 'buy', size: 1000, price: 0.4495, time: '13:58' },
    { symbol: 'ETHUSD', side: 'buy', size: 0.8, price: 2845.3, time: '13:45' },
    {
      symbol: 'BTCUSD',
      side: 'buy',
      size: 0.15,
      price: 44195.8,
      time: '13:30',
    },
    {
      symbol: 'BTCUSD',
      side: 'buy',
      size: 0.15,
      price: 44195.8,
      time: '13:30',
    },
    {
      symbol: 'BTCUSD',
      side: 'buy',
      size: 0.15,
      price: 44195.8,
      time: '13:30',
    },
    {
      symbol: 'BTCUSD',
      side: 'buy',
      size: 0.15,
      price: 44195.8,
      time: '13:30',
    },
    {
      symbol: 'BTCUSD',
      side: 'buy',
      size: 0.15,
      price: 44195.8,
      time: '13:30',
    },
  ];

  ngOnInit() {
    this.checkScreenSize();
  }

  @HostListener('window:resize', ['$event'])
  onWindowResize(): void {
    this.checkScreenSize();
  }

  private checkScreenSize(): void {
    this.isDesktop = window.innerWidth >= 1024;
  }

  toggleOrderView(view: 'book' | 'trades'): void {
    this.currentOrderView = view;
  }

  get maxSize(): number {
    const allOrders = [...this.orderBook.asks, ...this.orderBook.bids];
    return Math.max(...allOrders.map((order) => order.size));
  }
}
