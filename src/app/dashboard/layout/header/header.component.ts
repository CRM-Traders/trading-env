import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  HostListener,
  inject,
  Input,
  Output,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { WalletService } from '../../../core/services/wallet.service';
import { TradingAccountService } from '../../../core/services/trading-account.service';
import { environment } from '../../../../environments/environment';
import { Subject, takeUntil, interval } from 'rxjs';

export interface WalletBalance {
  id: string;
  currency: string;
  availableBalance: number;
  lockedBalance: number;
  totalBalance: number;
  usdEquivalent: number;
  lastPriceUpdate: string;
}

export interface PortfolioHolding {
  currency: string;
  balance: number;
  usdPrice: number;
  usdValue: number;
  percentage: number;
  change24h: number;
}

export interface Portfolio {
  tradingAccountId: string;
  totalUsdValue: number;
  holdings: PortfolioHolding[];
  timestamp: string;
}

@Component({
  selector: 'app-header',
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent implements OnInit, OnDestroy {
  authService = inject(AuthService);
  walletService = inject(WalletService);
  tradingAccountService = inject(TradingAccountService);

  title = 'Dashboard';
  @Input() isUserDropdownOpen = false;
  userName = this.authService.getName();
  userEmail = this.authService.getRole();
  userInitials =
    this.userName[0].toUpperCase() + this.userName[1].toUpperCase();

  portfolio: Portfolio | null = null;
  isLoadingPortfolio = true;
  private destroy$ = new Subject<void>();

  @Output() toggleSidebar = new EventEmitter<void>();
  @Output() toggleUserDropdown = new EventEmitter<void>();

  ngOnInit(): void {
    this.loadPortfolio();
    // Refresh portfolio every 30 seconds
    interval(30000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadPortfolio());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadPortfolio(): void {
    this.walletService
      .getPortfolio()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (portfolio: any) => {
          this.portfolio = portfolio;
          this.isLoadingPortfolio = false;
        },
        error: () => {
          this.isLoadingPortfolio = false;
        },
      });
  }

  onToggleSidebar(): void {
    this.toggleSidebar.emit();
  }

  onToggleUserDropdown(): void {
    this.toggleUserDropdown.emit();
  }

  // Close dropdown when clicking outside
  @HostListener('document:click', ['$event'])
  closeDropdownOnOutsideClick(event: Event) {
    const target = event.target as HTMLElement;
    const dropdown = document.querySelector('.user-dropdown-container');

    if (dropdown && !dropdown.contains(target) && this.isUserDropdownOpen) {
      this.toggleUserDropdown.emit();
    }
  }

  logout() {
    window.location.href = environment.redirectUrl;
  }
}
