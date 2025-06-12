import { CommonModule } from '@angular/common';
import { Component, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface TradingPair {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

@Component({
  selector: 'app-market-watch',
  imports: [CommonModule, FormsModule],
  templateUrl: './market-watch.component.html',
  styleUrl: './market-watch.component.scss',
})
export class MarketWatchComponent {
  selectedPair: TradingPair | null = null;
  showPairSelector = false;
  searchTerm = '';
  dailyHigh = 45250.75;
  dailyLow = 43180.25;
  dailyVolume = 1248750000;

  tradingPairs: TradingPair[] = [
    { symbol: 'BTCUSD', name: 'Bitcoin', price: 44250.50, change: 1240.25, changePercent: 2.89 },
    { symbol: 'ETHUSD', name: 'Ethereum', price: 2847.75, change: -45.20, changePercent: -1.56 },
    { symbol: 'ADAUSD', name: 'Cardano', price: 0.4521, change: 0.0123, changePercent: 2.80 },
    { symbol: 'SOLUSD', name: 'Solana', price: 98.45, change: 4.21, changePercent: 4.47 },
    { symbol: 'DOTUSD', name: 'Polkadot', price: 6.23, change: -0.15, changePercent: -2.35 },
    { symbol: 'LINKUSD', name: 'Chainlink', price: 14.87, change: 0.45, changePercent: 3.12 },
  ];

  ngOnInit() {
    this.selectedPair = this.tradingPairs[0];
  }

  get filteredPairs(): TradingPair[] {
    if (!this.searchTerm) {
      return this.tradingPairs;
    }
    return this.tradingPairs.filter(pair =>
      pair.symbol.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
      pair.name.toLowerCase().includes(this.searchTerm.toLowerCase())
    );
  }

  selectTradingPair(pair: TradingPair): void {
    this.selectedPair = pair;
    this.showPairSelector = false;
    this.searchTerm = '';
  }

  togglePairSelector(): void {
    this.showPairSelector = !this.showPairSelector;
    if (!this.showPairSelector) {
      this.searchTerm = '';
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.pair-selector-container')) {
      this.showPairSelector = false;
      this.searchTerm = '';
    }
  }
}
