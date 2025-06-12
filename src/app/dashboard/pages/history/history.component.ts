import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';

// Interfaces
export interface TradeHistory {
  id: string;
  date: Date;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
}

export interface TradingStats {
  totalTrades: number;
  winRate: number;
  totalPnL: number;
  volumeTraded: number;
  tradesThisWeek: number;
  winRateChange: number;
  pnlPercent: number;
}

@Component({
  selector: 'app-history',
  imports: [CommonModule],
  templateUrl: './history.component.html',
  styleUrls: ['./history.component.scss']
})
export class HistoryComponent implements OnInit {

  // Properties
  tradeHistory: TradeHistory[] = [];
  filteredHistory: TradeHistory[] = [];
  tradingStats: TradingStats = {
    totalTrades: 0,
    winRate: 0,
    totalPnL: 0,
    volumeTraded: 0,
    tradesThisWeek: 0,
    winRateChange: 0,
    pnlPercent: 0
  };

  // Pagination
  currentPage = 1;
  itemsPerPage = 20;
  totalPages = 0;

  // Filters
  selectedPeriod = 'Last 30 Days';
  periods = [
    'Last 7 Days',
    'Last 30 Days',
    'Last 3 Months',
    'All Time'
  ];

  // Loading state
  isLoading = false;

  constructor() {}

  ngOnInit(): void {
    this.loadTradeHistory();
    this.calculateStats();
  }

  // Load trade history data
  loadTradeHistory(): void {
    this.isLoading = true;

    // Sample data - replace with actual API call
    this.tradeHistory = [
      {
        id: '1',
        date: new Date('2024-05-29T14:30:00Z'),
        symbol: 'BTCUSD',
        side: 'long',
        size: 0.25,
        entryPrice: 42500.00,
        exitPrice: 43200.50,
        pnl: 175.12,
        pnlPercent: 1.65
      },
      {
        id: '2',
        date: new Date('2024-05-29T11:15:00Z'),
        symbol: 'ETHUSD',
        side: 'short',
        size: 1.5,
        entryPrice: 2650.75,
        exitPrice: 2580.30,
        pnl: 105.67,
        pnlPercent: 2.66
      },
      {
        id: '3',
        date: new Date('2024-05-28T16:45:00Z'),
        symbol: 'SOLUSD',
        side: 'long',
        size: 15.0,
        entryPrice: 32.50,
        exitPrice: 35.75,
        pnl: 48.75,
        pnlPercent: 10.00
      },
      {
        id: '4',
        date: new Date('2024-05-28T09:20:00Z'),
        symbol: 'ADAUSD',
        side: 'short',
        size: 200.0,
        entryPrice: 0.485,
        exitPrice: 0.465,
        pnl: 4.00,
        pnlPercent: 4.12
      },
      {
        id: '5',
        date: new Date('2024-05-27T13:10:00Z'),
        symbol: 'DOTUSD',
        side: 'long',
        size: 12.0,
        entryPrice: 7.85,
        exitPrice: 7.42,
        pnl: -5.16,
        pnlPercent: -5.48
      },
      {
        id: '6',
        date: new Date('2024-05-27T10:30:00Z'),
        symbol: 'LINKUSD',
        side: 'short',
        size: 8.0,
        entryPrice: 15.75,
        exitPrice: 14.90,
        pnl: 6.80,
        pnlPercent: 5.40
      },
      {
        id: '7',
        date: new Date('2024-05-26T15:25:00Z'),
        symbol: 'AVAXUSD',
        side: 'long',
        size: 6.0,
        entryPrice: 28.90,
        exitPrice: 30.15,
        pnl: 7.50,
        pnlPercent: 4.33
      },
      {
        id: '8',
        date: new Date('2024-05-26T08:40:00Z'),
        symbol: 'MATICUSD',
        side: 'long',
        size: 80.0,
        entryPrice: 0.725,
        exitPrice: 0.698,
        pnl: -2.16,
        pnlPercent: -3.72
      }
    ];

    this.applyFilter();
    this.isLoading = false;
  }

  // Calculate trading statistics
  calculateStats(): void {
    const totalTrades = this.tradeHistory.length;
    const winningTrades = this.tradeHistory.filter(trade => trade.pnl > 0).length;
    const totalPnL = this.tradeHistory.reduce((sum, trade) => sum + trade.pnl, 0);
    const totalVolume = this.tradeHistory.reduce((sum, trade) =>
      sum + (trade.size * trade.entryPrice), 0);

    this.tradingStats = {
      totalTrades: totalTrades,
      winRate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0,
      totalPnL: totalPnL,
      volumeTraded: totalVolume,
      tradesThisWeek: 12, // Mock data
      winRateChange: 2.1, // Mock data
      pnlPercent: 15.2 // Mock data
    };
  }

  // Apply period filter
  onPeriodChange(period: string): void {
    this.selectedPeriod = period;
    this.applyFilter();
  }

  // Filter trades based on selected period
  applyFilter(): void {
    const now = new Date();
    let cutoffDate: Date;

    switch (this.selectedPeriod) {
      case 'Last 7 Days':
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'Last 30 Days':
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'Last 3 Months':
        cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        cutoffDate = new Date(0); // All time
    }

    this.filteredHistory = this.tradeHistory.filter(trade =>
      trade.date >= cutoffDate
    );

    this.totalPages = Math.ceil(this.filteredHistory.length / this.itemsPerPage);
    this.currentPage = 1;
  }

  // Get paginated data
  get paginatedHistory(): TradeHistory[] {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    return this.filteredHistory.slice(startIndex, endIndex);
  }

  // Pagination methods
  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
    }
  }

  // Get page numbers for pagination
  get pageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    const start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    const end = Math.min(this.totalPages, start + maxVisible - 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  // Export functionality
  exportData(): void {
    const csvData = this.convertToCSV(this.filteredHistory);
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trading-history-${this.selectedPeriod.replace(/\s+/g, '-').toLowerCase()}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  // Convert data to CSV format
  private convertToCSV(data: TradeHistory[]): string {
    const headers = ['Date', 'Symbol', 'Side', 'Size', 'Entry Price', 'Exit Price', 'P&L', 'P&L %'];
    const csvRows = [headers.join(',')];

    data.forEach(trade => {
      const row = [
        trade.date.toISOString(),
        trade.symbol,
        trade.side,
        trade.size.toString(),
        trade.entryPrice.toString(),
        trade.exitPrice.toString(),
        trade.pnl.toString(),
        trade.pnlPercent.toString()
      ];
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }

  // Helper method to get symbol icon path
  getIconPath(symbol: string): string {
    return `/assets/icons/${symbol.toLowerCase().replace('usd', '')}.png`;
  }
}
