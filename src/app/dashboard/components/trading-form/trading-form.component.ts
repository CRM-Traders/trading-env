import { CommonModule } from '@angular/common';
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  HostListener,
} from '@angular/core';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  FormsModule,
} from '@angular/forms';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import {
  PositionService,
  TradingMode,
  OrderSide,
  Position,
  CreatePositionRequest,
} from '../../../core/services/position.service';
import { SignalRService } from '../../../core/services/signalr.service';
import { TradingPairsService } from '../../../core/services/trading-pairs.service';
import {
  TradingService,
  CreateOrderRequest,
  OpenOrder,
} from '../../../core/services/trading.service';
import { WalletService } from '../../../core/services/wallet.service';
import { TradingAccountService } from '../../../core/services/trading-account.service';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-trading-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './trading-form.component.html',
  styleUrls: ['./trading-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TradingFormComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  private readonly fb = inject(FormBuilder);
  private readonly tradingService = inject(TradingService);
  private readonly positionService = inject(PositionService);
  private readonly walletService = inject(WalletService);
  private readonly tradingAccountService = inject(TradingAccountService);
  private readonly notificationService = inject(NotificationService);
  private readonly signalRService = inject(SignalRService);
  private readonly tradingPairsService = inject(TradingPairsService);

  tradingForm!: FormGroup;

  currentTradingMode: TradingMode = 'spot';
  currentOrderSide: OrderSide = 'buy';
  showTradingModal = false;
  isSubmitting = false;
  isLoading = false;

  // New properties for open orders
  currentViewTab: 'positions' | 'orders' = 'positions';
  openOrders: OpenOrder[] = [];
  isLoadingOrders = false;

  currentPrice = 0;
  selectedPair: any = null;

  // Account Data
  currentTradingAccount: any = null;
  availableBalance = 0;
  positions: Position[] = [];
  totalPnL = 0;

  // Configuration Constants
  readonly leverageOptions = [1, 2, 5, 10, 20, 50, 100];
  readonly percentageOptions = [25, 50, 75, 100];
  readonly minOrderValue = 10; // Minimum order value in USDT

  constructor() {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.initializeComponent();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    document.body.style.overflow = 'auto';
  }

  /**
   * Initialize the component and setup all necessary subscriptions
   */
  private async initializeComponent(): Promise<void> {
    this.isLoading = true;

    try {
      await this.loadTradingAccount();
      this.setupFormSubscriptions();
      this.setupMarketDataSubscriptions();
      this.setupPositionSubscriptions();
      this.setupOrderSubscriptions();
      await this.loadInitialData();
    } catch (error) {
      this.handleComponentError(
        'Failed to initialize trading component',
        error
      );
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Initialize the reactive form with proper validation
   */
  private initializeForm(): void {
    this.tradingForm = this.fb.group({
      price: [0, [Validators.required, Validators.min(0.01)]],
      quantity: [0, [Validators.required, Validators.min(0.00001)]],
      percentage: [0, [Validators.min(0), Validators.max(100)]],
      leverage: [
        1,
        [Validators.required, Validators.min(1), Validators.max(100)],
      ],
      stopLoss: [null, [Validators.min(0.01)]],
      takeProfit: [null, [Validators.min(0.01)]],
      orderType: ['Market', [Validators.required]],
    });
  }

  /**
   * Setup form value change subscriptions with proper debouncing
   */
  private setupFormSubscriptions(): void {
    // Handle percentage changes
    this.tradingForm
      .get('percentage')
      ?.valueChanges.pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        distinctUntilChanged()
      )
      .subscribe((percentage) => {
        if (percentage > 0 && percentage <= 100) {
          this.calculateQuantityFromPercentage(percentage);
        }
      });

    // Handle quantity changes
    this.tradingForm
      .get('quantity')
      ?.valueChanges.pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        distinctUntilChanged()
      )
      .subscribe(() => {
        this.updatePercentageFromQuantity();
      });

    // Handle order type changes
    this.tradingForm
      .get('orderType')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((orderType) => {
        if (orderType === 'Market') {
          this.updateFormPrice();
        }
      });
  }

  /**
   * Setup market data subscriptions for real-time updates
   */
  private setupMarketDataSubscriptions(): void {
    // Subscribe to selected trading pair changes
    this.tradingPairsService.selectedPair$
      .pipe(takeUntil(this.destroy$))
      .subscribe((pair) => {
        if (pair && pair.symbol !== this.selectedPair?.symbol) {
          this.selectedPair = pair;
          this.loadMarketData();
        }
      });

    // Subscribe to real-time price updates
    this.signalRService.tickerData$
      .pipe(takeUntil(this.destroy$))
      .subscribe((tickerData) => {
        if (tickerData.symbol === this.selectedPair?.symbol) {
          this.currentPrice = tickerData.lastPrice;
          this.updateFormPrice();
        }
      });
  }

  /**
   * Setup position subscriptions for real-time position updates
   */
  private setupPositionSubscriptions(): void {
    this.positionService.positions$
      .pipe(takeUntil(this.destroy$))
      .subscribe((positions) => {
        this.positions = positions;
        this.calculateTotalPnL();
      });
  }

  /**
   * Setup order subscriptions for real-time order updates
   */
  private setupOrderSubscriptions(): void {
    this.tradingService.openOrders$
      .pipe(takeUntil(this.destroy$))
      .subscribe((orders) => {
        this.openOrders = orders;
      });
  }

  /**
   * Load the current trading account
   */
  private async loadTradingAccount(): Promise<void> {
    try {
      const accounts = await this.tradingAccountService
        .getUserAccounts()
        .toPromise();

      if (accounts && accounts.length > 0) {
        this.currentTradingAccount =
          accounts.find((a) => a.status === 'Active') || accounts[0];
        this.tradingAccountService.setCurrentAccount(
          this.currentTradingAccount
        );
      } else {
        throw new Error('No trading accounts found');
      }
    } catch (error) {
      this.handleComponentError('Failed to load trading account', error);
    }
  }

  /**
   * Load all initial data required for the component
   */
  private async loadInitialData(): Promise<void> {
    if (!this.currentTradingAccount) return;

    const loadingPromises = [
      this.loadAvailableBalance(),
      this.loadPositions(),
      this.loadOpenOrders(),
      this.loadMarketData(),
    ];

    try {
      await Promise.all(loadingPromises);
    } catch (error) {
      this.handleComponentError('Failed to load initial data', error);
    }
  }

  /**
   * Load current market data for the selected trading pair
   */
  private async loadMarketData(): Promise<void> {
    if (!this.selectedPair) return;

    try {
      const tickerData = await this.tradingPairsService
        .getTickerData(this.selectedPair.symbol)
        .toPromise();

      if (tickerData) {
        this.currentPrice = tickerData.lastPrice;
        this.updateFormPrice();
      }
    } catch (error) {
      this.notificationService.showWarning(
        'Failed to load current market price'
      );
    }
  }

  /**
   * Load available balance for trading
   */
  private async loadAvailableBalance(): Promise<void> {
    if (!this.currentTradingAccount) return;

    try {
      const balances = await this.walletService
        .getWallets(this.currentTradingAccount.id)
        .toPromise();
      const usdtBalance = balances?.find((b) => b.currency === 'USDT');
      this.availableBalance = usdtBalance?.availableBalance || 0;
    } catch (error) {
      this.notificationService.showWarning('Failed to load wallet balance');
    }
  }

  /**
   * Load current positions
   */
  async loadPositions(): Promise<void> {
    if (!this.currentTradingAccount) return;

    try {
      const positions = await this.positionService
        .getPositions(this.currentTradingAccount.id)
        .toPromise();
      this.positions = positions || [];
      this.calculateTotalPnL();
    } catch (error) {
      this.notificationService.showWarning('Failed to load open positions');
    }
  }

  /**
   * Load open orders (NEW METHOD)
   */
  async loadOpenOrders(): Promise<void> {
    if (!this.currentTradingAccount) return;

    this.isLoadingOrders = true;
    try {
      const result = await this.tradingService
        .getOpenOrders(this.currentTradingAccount.id)
        .toPromise();

      this.openOrders = result?.items || [];
    } catch (error) {
      this.notificationService.showWarning('Failed to load open orders');
      console.error('Error loading open orders:', error);
    } finally {
      this.isLoadingOrders = false;
    }
  }

  /**
   * Cancel an open order (NEW METHOD)
   */
  async cancelOrder(orderId: string): Promise<void> {
    try {
      await this.tradingService.cancelOrder(orderId).toPromise();
      this.notificationService.showSuccess('Order cancelled successfully');

      // Refresh orders after cancelling
      await this.loadOpenOrders();
      await this.loadAvailableBalance();
    } catch (error: any) {
      console.error('Failed to cancel order:', error);
      this.notificationService.showError(
        error.message || 'Failed to cancel order'
      );
    }
  }

  /**
   * Switch between positions and orders view (NEW METHOD)
   */
  switchViewTab(tab: 'positions' | 'orders'): void {
    this.currentViewTab = 'orders'; //tab;
    if (tab === 'orders') {
      this.loadOpenOrders();
    }
  }

  /**
   * Update form price based on current market price
   */
  private updateFormPrice(): void {
    if (
      this.tradingForm.get('orderType')?.value === 'Market' &&
      this.currentPrice > 0
    ) {
      this.tradingForm.patchValue(
        { price: this.currentPrice },
        { emitEvent: false }
      );
    }
  }

  /**
   * Calculate quantity based on percentage of available balance
   */
  private calculateQuantityFromPercentage(percentage: number): void {
    if (!this.currentPrice || !this.availableBalance) return;

    const price = this.tradingForm.get('price')?.value || this.currentPrice;
    const leverage =
      this.currentTradingMode === 'cross'
        ? this.tradingForm.get('leverage')?.value || 1
        : 1;

    let maxQuantity = 0;

    if (this.currentOrderSide === 'buy') {
      const effectiveBalance = this.availableBalance * leverage;
      maxQuantity = effectiveBalance / price;
    } else {
      // For sell orders, we need to check the base asset balance
      // This would require additional wallet service integration
      maxQuantity = 1; // Placeholder - implement based on actual base asset balance
    }

    const quantity = (maxQuantity * percentage) / 100;
    this.tradingForm.patchValue({ quantity }, { emitEvent: false });
  }

  /**
   * Update percentage based on entered quantity
   */
  private updatePercentageFromQuantity(): void {
    const quantity = this.tradingForm.get('quantity')?.value || 0;
    const price = this.tradingForm.get('price')?.value || this.currentPrice;

    if (!quantity || !price || !this.availableBalance) {
      this.tradingForm.patchValue({ percentage: 0 }, { emitEvent: false });
      return;
    }

    const leverage =
      this.currentTradingMode === 'cross'
        ? this.tradingForm.get('leverage')?.value || 1
        : 1;

    let maxQuantity = 0;

    if (this.currentOrderSide === 'buy') {
      const effectiveBalance = this.availableBalance * leverage;
      maxQuantity = effectiveBalance / price;
    } else {
      maxQuantity = 1; // Placeholder
    }

    const percentage = Math.min(100, (quantity / maxQuantity) * 100);
    this.tradingForm.patchValue({ percentage }, { emitEvent: false });
  }

  /**
   * Calculate total unrealized P&L from all positions
   */
  private calculateTotalPnL(): void {
    this.totalPnL = this.positions.reduce(
      (sum, position) => sum + position.unrealizedPnL,
      0
    );
  }

  /**
   * Validate the current form state
   */
  private validateForm(): string | null {
    if (!this.currentTradingAccount) {
      return 'No trading account selected';
    }

    if (!this.selectedPair) {
      return 'No trading pair selected';
    }

    if (this.tradingForm.invalid) {
      return 'Please correct form errors';
    }

    const quantity = this.tradingForm.get('quantity')?.value;
    const price = this.tradingForm.get('price')?.value;

    if (!quantity || quantity <= 0) {
      return 'Please enter a valid quantity';
    }

    if (!price || price <= 0) {
      return 'Please enter a valid price';
    }

    const orderValue = quantity * price;
    if (orderValue < this.minOrderValue) {
      return `Minimum order value is ${this.minOrderValue} USDT`;
    }

    if (this.currentOrderSide === 'buy' && orderValue > this.availableBalance) {
      return 'Insufficient balance';
    }

    return null;
  }

  /**
   * Handle component-level errors
   */
  private handleComponentError(message: string, error: any): void {
    console.error(message, error);
    this.notificationService.showError(
      `${message}: ${error?.message || 'Unknown error'}`
    );
  }

  // Public Methods

  /**
   * Set the trading mode (Spot or Cross)
   */
  setTradingMode(mode: TradingMode): void {
    this.currentTradingMode = mode;

    if (mode === 'spot') {
      this.tradingForm.patchValue({ leverage: 1 });
    }

    this.updatePercentageFromQuantity();
  }

  /**
   * Set the order side (Buy or Sell)
   */
  setOrderSide(side: OrderSide): void {
    this.currentOrderSide = side;
    this.updatePercentageFromQuantity();
  }

  /**
   * Set percentage for position sizing
   */
  setPercentage(percentage: number): void {
    this.tradingForm.patchValue({ percentage });
  }

  /**
   * Set order type (Market or Limit)
   */
  setOrderType(type: 'Market' | 'Limit'): void {
    this.tradingForm.patchValue({ orderType: type });
  }

  /**
   * Execute a trade based on current form values and trading mode
   */
  async executeTrade(): Promise<void> {
    const validationError = this.validateForm();
    if (validationError) {
      this.notificationService.showError(validationError);
      return;
    }

    if (this.isSubmitting) return;

    this.isSubmitting = true;

    try {
      const formValue = this.tradingForm.value;

      if (this.currentTradingMode === 'spot') {
        await this.executeSpotTrade(formValue);
      } else {
        await this.executeCrossTrade(formValue);
      }

      this.resetForm();
      this.notificationService.showSuccess('Trade executed successfully');

      // Refresh data after successful trade
      await this.loadInitialData();
    } catch (error: any) {
      console.error('Trade execution failed:', error);
      this.notificationService.showError(
        error.message || 'Trade execution failed'
      );
    } finally {
      this.isSubmitting = false;
    }
  }

  /**
   * Execute a spot trade
   */
  private async executeSpotTrade(formValue: any): Promise<void> {
    const request: CreateOrderRequest = {
      tradingAccountId: this.currentTradingAccount.id,
      symbol: this.selectedPair.symbol,
      orderType: formValue.orderType,
      side: this.currentOrderSide === 'buy' ? 'Buy' : 'Sell',
      quantity: formValue.quantity,
      price: formValue.orderType === 'Limit' ? formValue.price : undefined,
    };

    await this.tradingService.createOrder(request).toPromise();
  }

  /**
   * Execute a cross/futures trade
   */
  private async executeCrossTrade(formValue: any): Promise<void> {
    const request: CreatePositionRequest = {
      tradingAccountId: this.currentTradingAccount.id,
      symbol: this.selectedPair.symbol,
      side: this.currentOrderSide === 'buy' ? 'Long' : 'Short',
      quantity: formValue.quantity,
      leverage: formValue.leverage,
      stopLoss: formValue.stopLoss || undefined,
      takeProfit: formValue.takeProfit || undefined,
    };

    await this.positionService.openPosition(request).toPromise();
  }

  /**
   * Close a specific position
   */
  async closePosition(positionId: string): Promise<void> {
    try {
      await this.positionService.closePosition(positionId).toPromise();
      this.notificationService.showSuccess('Position closed successfully');

      // Refresh positions after closing
      await this.loadPositions();
      await this.loadAvailableBalance();
    } catch (error: any) {
      console.error('Failed to close position:', error);
      this.notificationService.showError(
        error.message || 'Failed to close position'
      );
    }
  }

  /**
   * Reset the form to initial state
   */
  private resetForm(): void {
    this.tradingForm.patchValue({
      quantity: 0,
      percentage: 0,
      stopLoss: null,
      takeProfit: null,
    });
  }

  /**
   * Track by function for position list performance
   */
  trackByPositionId(index: number, position: Position): string {
    return position.id;
  }

  /**
   * Track by function for order list performance (NEW METHOD)
   */
  trackByOrderId(index: number, order: OpenOrder): string {
    return order.id;
  }

  // Modal Management

  /**
   * Open trading modal for mobile
   */
  openTradingModal(mode: TradingMode): void {
    this.currentTradingMode = mode;
    this.showTradingModal = true;
    document.body.style.overflow = 'hidden';
  }

  /**
   * Close trading modal
   */
  closeTradingModal(): void {
    this.showTradingModal = false;
    document.body.style.overflow = 'auto';
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent): void {
    if (this.showTradingModal) {
      this.closeTradingModal();
    }
  }

  // Utility Methods

  /**
   * Format price for display
   */
  formatPrice(price: number): string {
    if (price >= 1) return price.toFixed(2);
    if (price >= 0.01) return price.toFixed(4);
    return price.toFixed(6);
  }

  /**
   * Format P&L for display
   */
  formatPnL(pnl: number): string {
    return pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
  }

  /**
   * Get CSS class for P&L display
   */
  getPnLClass(pnl: number): string {
    return pnl >= 0 ? 'text-green-400' : 'text-red-400';
  }

  /**
   * Get CSS class for order status (NEW METHOD)
   */
  getStatusClass(status: string): string {
    switch (status.toLowerCase()) {
      case 'pending':
      case 'open':
        return 'text-yellow-400 bg-yellow-950/50 border-yellow-800/50';
      case 'partiallyfilled':
        return 'text-blue-400 bg-blue-950/50 border-blue-800/50';
      case 'filled':
        return 'text-green-400 bg-green-950/50 border-green-800/50';
      case 'cancelled':
        return 'text-red-400 bg-red-950/50 border-red-800/50';
      default:
        return 'text-gray-400 bg-gray-950/50 border-gray-800/50';
    }
  }

  /**
   * Get order side class (NEW METHOD)
   */
  getOrderSideClass(side: string): string {
    return side.toLowerCase() === 'buy'
      ? 'text-green-400 bg-green-950/50 border-green-800/50'
      : 'text-red-400 bg-red-950/50 border-red-800/50';
  }

  /**
   * Check if form is valid for submission
   */
  isFormValid(): boolean {
    return (
      this.tradingForm.valid &&
      this.tradingForm.get('quantity')?.value > 0 &&
      (this.tradingForm.get('orderType')?.value === 'Market' ||
        this.tradingForm.get('price')?.value > 0) &&
      !this.isSubmitting
    );
  }

  /**
   * Get current order value in USDT
   */
  getCurrentOrderValue(): number {
    const quantity = this.tradingForm.get('quantity')?.value || 0;
    const price = this.tradingForm.get('price')?.value || this.currentPrice;
    return quantity * price;
  }

  /**
   * Get maximum position size based on balance and leverage
   */
  getMaxPositionSize(): number {
    if (!this.availableBalance || !this.currentPrice) return 0;

    const leverage =
      this.currentTradingMode === 'cross'
        ? this.tradingForm.get('leverage')?.value || 1
        : 1;

    return (this.availableBalance * leverage) / this.currentPrice;
  }

  calculateClass(pct: number) {
    return Math.abs(this.tradingForm.get('percentage')?.value - pct) < 1
      ? 'bg-blue-600 text-white'
      : 'bg-gray-700 text-gray-300 hover:bg-gray-600';
  }
}
