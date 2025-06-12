import { CommonModule } from '@angular/common';
import { Component, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface Position {
  symbol: string;           // e.g., "BTCUSD"
  fullName?: string;        // e.g., "Bitcoin"
  side: 'long' | 'short';   // Position direction
  size: number;             // Position size
  entryPrice: number;       // Entry price
  currentPrice: number;     // Current market price
  pnl: number;             // Unrealized P&L in USD
  pnlPercent: number;      // P&L as percentage
  entryTime: Date;         // When position was opened
}

@Component({
  selector: 'app-trading-form',
  imports: [CommonModule, FormsModule],
  templateUrl: './trading-form.component.html',
  styleUrl: './trading-form.component.scss',
})
export class TradingFormComponent {
  tradeType: 'buy' | 'sell' = 'buy';
  orderPrice = 44250.50;
  orderAmount = 0;
  orderPercentage = 0;
  showTradingModal = false;
  currentTradeMode: 'spot' | 'cross' = 'spot';
  accountBalance = 50000;
  positions: Position[] = [
  {
    symbol: 'BTCUSD',
    fullName: 'Bitcoin',
    side: 'long' as const,
    size: 0.5,
    entryPrice: 42500.00,
    currentPrice: 43200.50,
    pnl: 350.25,
    pnlPercent: 1.65,
    entryTime: new Date('2024-05-28T09:15:30Z')
  },
  {
    symbol: 'ETHUSD',
    fullName: 'Ethereum',
    side: 'short' as const,
    size: 2.0,
    entryPrice: 2650.75,
    currentPrice: 2720.30,
    pnl: -139.10,
    pnlPercent: -2.62,
    entryTime: new Date('2024-05-28T14:22:15Z')
  },
  {
    symbol: 'SOLUSD',
    fullName: 'Solana',
    side: 'long' as const,
    size: 10.0,
    entryPrice: 32.50,
    currentPrice: 35.75,
    pnl: 32.50,
    pnlPercent: 10.00,
    entryTime: new Date('2024-05-27T16:45:00Z')
  },
  {
    symbol: 'ADAUSD',
    fullName: 'Cardano',
    side: 'long' as const,
    size: 500.0,
    entryPrice: 0.485,
    currentPrice: 0.478,
    pnl: -3.50,
    pnlPercent: -1.44,
    entryTime: new Date('2024-05-29T08:30:45Z')
  },
  {
    symbol: 'DOTUSD',
    fullName: 'Polkadot',
    side: 'short' as const,
    size: 25.0,
    entryPrice: 7.85,
    currentPrice: 7.12,
    pnl: 18.25,
    pnlPercent: 9.30,
    entryTime: new Date('2024-05-26T11:20:30Z')
  },
  {
    symbol: 'AVAXUSD',
    fullName: 'Avalanche',
    side: 'long' as const,
    size: 8.0,
    entryPrice: 28.90,
    currentPrice: 29.15,
    pnl: 2.00,
    pnlPercent: 0.86,
    entryTime: new Date('2024-05-29T10:15:20Z')
  },
  {
    symbol: 'LINKUSD',
    fullName: 'Chainlink',
    side: 'short' as const,
    size: 15.0,
    entryPrice: 15.75,
    currentPrice: 16.85,
    pnl: -16.50,
    pnlPercent: -6.98,
    entryTime: new Date('2024-05-28T13:40:10Z')
  },
  {
    symbol: 'MATICUSD',
    fullName: 'Polygon',
    side: 'long' as const,
    size: 100.0,
    entryPrice: 0.725,
    currentPrice: 0.742,
    pnl: 1.70,
    pnlPercent: 2.34,
    entryTime: new Date('2024-05-29T07:25:55Z')
  }
];

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent): void {
    if (this.showTradingModal) {
      this.closeTradingModal();
    }
  }

  setTradeType(type: 'buy' | 'sell'): void {
    this.tradeType = type;
  }

  setOrderPercentage(percentage: number): void {
    this.orderPercentage = percentage;

    if (this.tradeType === 'buy' && this.orderPrice > 0) {
      const maxAmount = this.accountBalance / this.orderPrice;
      this.orderAmount = (maxAmount * percentage) / 100;
    }
  }

  placeBuyOrder(): void {
    if (!this.orderPrice || !this.orderAmount) {
      alert('Please fill in all required fields');
      return;
    }

    const totalCost = this.orderPrice * this.orderAmount;
    if (totalCost > this.accountBalance) {
      alert('Insufficient balance');
      return;
    }

    console.log('Buy Order Placed:', {
      type: 'buy',
      price: this.orderPrice,
      amount: this.orderAmount,
      total: totalCost,
      mode: this.currentTradeMode
    });

    alert(`${this.currentTradeMode.toUpperCase()} Buy order placed: ${this.orderAmount} BTC at $${this.orderPrice}`);

    this.resetOrderForm();
  }

  placeSellOrder(): void {
    if (!this.orderPrice || !this.orderAmount) {
      alert('Please fill in all required fields');
      return;
    }

    console.log('Sell Order Placed:', {
      type: 'sell',
      price: this.orderPrice,
      amount: this.orderAmount,
      total: this.orderPrice * this.orderAmount,
      mode: this.currentTradeMode
    });

    alert(`${this.currentTradeMode.toUpperCase()} Sell order placed: ${this.orderAmount} BTC at $${this.orderPrice}`);

    this.resetOrderForm();
  }

  openTradingModal(mode: 'spot' | 'cross'): void {
    this.currentTradeMode = mode;
    this.showTradingModal = true;
    document.body.style.overflow = 'hidden';
  }

  closeTradingModal(): void {
    this.showTradingModal = false;
    document.body.style.overflow = 'auto';
  }

  executeModalTrade(action: 'buy' | 'sell'): void {
    if (action === 'buy') {
      this.placeBuyOrder();
    } else {
      this.placeSellOrder();
    }

    if (this.orderPrice && this.orderAmount) {
      setTimeout(() => {
        this.closeTradingModal();
      }, 500);
    }
  }

  private resetOrderForm(): void {
    this.orderAmount = 0;
    this.orderPercentage = 0;
  }

  get totalPnL(): number {
  return this.positions.reduce((sum, pos) => sum + pos.pnl, 0);
}
}
