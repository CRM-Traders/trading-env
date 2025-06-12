import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { interval, Subscription } from 'rxjs';

// Interfaces
export interface Holding {
  symbol: string;
  name: string;
  amount: number;
  value: number;
  change: number;
  allocation: number;
  currentPrice: number;
}

export interface Activity {
  id: string;
  type: 'buy' | 'sell' | 'deposit' | 'withdraw';
  description: string;
  date: Date;
  amount: number;
  symbol?: string;
}

export interface AssetAllocation {
  symbol: string;
  allocation: number;
  value: number;
}

export interface PortfolioSummary {
  totalValue: number;
  availableBalance: number;
  totalChange: number;
  totalChangePercent: number;
  dayPnL: number;
  dayPnLPercent: number;
  openPositions: number;
  openPositionsPnL: number;
  totalAssets: number;
}

@Component({
  selector: 'app-portfolio',
  imports: [CommonModule],
  templateUrl: './portfolio.component.html',
  styleUrl: './portfolio.component.scss',
})
export class PortfolioComponent implements OnInit, OnDestroy {
  // Properties
  portfolioSummary: PortfolioSummary = {
    totalValue: 0,
    availableBalance: 0,
    totalChange: 0,
    totalChangePercent: 0,
    dayPnL: 0,
    dayPnLPercent: 0,
    openPositions: 0,
    openPositionsPnL: 0,
    totalAssets: 0,
  };

  holdings: Holding[] = [];
  recentActivity: Activity[] = [];
  topAssets: AssetAllocation[] = [];

  // Filters
  selectedAssetType = 'All Assets';
  assetTypes = ['All Assets', 'Spot', 'Futures'];

  // Loading states
  isLoading = false;
  isRefreshing = false;

  // Subscriptions
  private refreshSubscription?: Subscription;

  constructor() {}

  ngOnInit(): void {
    this.loadPortfolioData();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
    }
  }

  // Load all portfolio data
  loadPortfolioData(): void {
    this.isLoading = true;

    // Simulate API calls - replace with actual service calls
    Promise.all([
      this.loadHoldings(),
      this.loadRecentActivity(),
      this.loadAssetAllocation(),
    ]).then(() => {
      this.calculatePortfolioSummary();
      this.isLoading = false;
    });
  }

  // Load holdings data
  private async loadHoldings(): Promise<void> {
    // Sample data - replace with actual API call
    this.holdings = [
      {
        symbol: 'BTCUSD',
        name: 'Bitcoin',
        amount: 1.25,
        currentPrice: 43200.0,
        value: 54000.0,
        change: 2.4,
        allocation: 42.5,
      },
      {
        symbol: 'ETHUSD',
        name: 'Ethereum',
        amount: 8.5,
        currentPrice: 2700.0,
        value: 22950.0,
        change: -1.2,
        allocation: 18.1,
      },
      {
        symbol: 'SOLUSD',
        name: 'Solana',
        amount: 45.0,
        currentPrice: 35.72,
        value: 1607.5,
        change: 8.7,
        allocation: 12.6,
      },
      {
        symbol: 'ADAUSD',
        name: 'Cardano',
        amount: 1200.0,
        currentPrice: 0.48,
        value: 576.0,
        change: -3.1,
        allocation: 4.5,
      },
      {
        symbol: 'DOTUSD',
        name: 'Polkadot',
        amount: 85.0,
        currentPrice: 7.12,
        value: 605.25,
        change: 1.8,
        allocation: 4.8,
      },
      {
        symbol: 'LINKUSD',
        name: 'Chainlink',
        amount: 28.0,
        currentPrice: 16.8,
        value: 470.4,
        change: -0.8,
        allocation: 3.7,
      },
      {
        symbol: 'AVAXUSD',
        name: 'Avalanche',
        amount: 15.0,
        currentPrice: 29.0,
        value: 435.0,
        change: 4.2,
        allocation: 3.4,
      },
      {
        symbol: 'MATICUSD',
        name: 'Polygon',
        amount: 180.0,
        currentPrice: 0.74,
        value: 133.2,
        change: -2.5,
        allocation: 1.0,
      },
    ];
  }

  // Load recent activity
  private async loadRecentActivity(): Promise<void> {
    this.recentActivity = [
      {
        id: '1',
        type: 'buy',
        description: 'Bought BTC',
        date: new Date('2024-05-29T14:30:00Z'),
        amount: 1087.5,
        symbol: 'BTCUSD',
      },
      {
        id: '2',
        type: 'sell',
        description: 'Sold ETH',
        date: new Date('2024-05-29T11:15:00Z'),
        amount: -845.25,
        symbol: 'ETHUSD',
      },
      {
        id: '3',
        type: 'deposit',
        description: 'USD Deposit',
        date: new Date('2024-05-28T16:45:00Z'),
        amount: 2500.0,
      },
      {
        id: '4',
        type: 'buy',
        description: 'Bought SOL',
        date: new Date('2024-05-28T09:20:00Z'),
        amount: 487.5,
        symbol: 'SOLUSD',
      },
      {
        id: '5',
        type: 'sell',
        description: 'Sold ADA',
        date: new Date('2024-05-27T13:10:00Z'),
        amount: -97.0,
        symbol: 'ADAUSD',
      },
      {
        id: '6',
        type: 'buy',
        description: 'Bought LINK',
        date: new Date('2024-05-27T10:30:00Z'),
        amount: 126.0,
        symbol: 'LINKUSD',
      },
    ];
  }

  // Load asset allocation
  private async loadAssetAllocation(): Promise<void> {
    this.topAssets = [
      { symbol: 'BTC', allocation: 42.5, value: 19245 },
      { symbol: 'ETH', allocation: 18.1, value: 8189 },
      { symbol: 'SOL', allocation: 12.6, value: 5701 },
      { symbol: 'DOT', allocation: 4.8, value: 2172 },
      { symbol: 'ADA', allocation: 4.5, value: 2036 },
      { symbol: 'LINK', allocation: 3.7, value: 1674 },
      { symbol: 'AVAX', allocation: 3.4, value: 1538 },
      { symbol: 'Others', allocation: 10.4, value: 4705 },
    ];
  }

  // Calculate portfolio summary
  private calculatePortfolioSummary(): void {
    const totalValue = this.holdings.reduce(
      (sum, holding) => sum + holding.value,
      0
    );
    const totalChange = this.holdings.reduce(
      (sum, holding) => sum + (holding.value * holding.change) / 100,
      0
    );

    this.portfolioSummary = {
      totalValue: totalValue,
      availableBalance: 2847.3, // Mock data
      totalChange: totalChange,
      totalChangePercent: (totalChange / (totalValue - totalChange)) * 100,
      dayPnL: 1247.5, // Mock data
      dayPnLPercent: 2.84, // Mock data
      openPositions: 8, // Mock data
      openPositionsPnL: 358.25, // Mock data
      totalAssets: this.holdings.length,
    };
  }

  // Filter holdings by asset type
  onAssetTypeChange(assetType: string): void {
    this.selectedAssetType = assetType;
    // Implement filtering logic here if needed
  }

  // Refresh data
  refresh(): void {
    this.isRefreshing = true;
    this.loadPortfolioData();
    setTimeout(() => {
      this.isRefreshing = false;
    }, 1000);
  }

  // Auto refresh every 30 seconds
  private startAutoRefresh(): void {
    this.refreshSubscription = interval(30000).subscribe(() => {
      if (!this.isLoading && !this.isRefreshing) {
        this.refresh();
      }
    });
  }

  // Rebalance portfolio
  rebalancePortfolio(): void {
    // Implement rebalancing logic
    console.log('Rebalancing portfolio...');
    // This would typically open a modal or navigate to rebalancing page
  }

  // Get filtered holdings
  get filteredHoldings(): Holding[] {
    if (this.selectedAssetType === 'All Assets') {
      return this.holdings;
    }
    // Add filtering logic for Spot/Futures when needed
    return this.holdings;
  }

  // Helper methods
  getIconPath(symbol: string): string {
    const cleanSymbol = symbol.toLowerCase().replace('usd', '');
    return `/assets/icons/${cleanSymbol}.png`;
  }

  getActivityIcon(type: string): string {
    switch (type) {
      case 'buy':
        return 'arrow-up';
      case 'sell':
        return 'arrow-down';
      case 'deposit':
        return 'plus';
      case 'withdraw':
        return 'minus';
      default:
        return 'exchange';
    }
  }

  // Format currency
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  // Format percentage
  formatPercentage(value: number): string {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  }

  // Get change color class
  getChangeColorClass(change: number): string {
    return change >= 0 ? 'text-green-400' : 'text-red-400';
  }

  // Export portfolio data
  exportPortfolio(): void {
    const data = {
      summary: this.portfolioSummary,
      holdings: this.holdings,
      timestamp: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `portfolio-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
  }
}
