import { CommonModule } from '@angular/common';
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  HostListener,
  ChangeDetectorRef,
} from '@angular/core';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import {
  Subject,
  takeUntil,
  debounceTime,
  distinctUntilChanged,
  filter,
  combineLatest,
  BehaviorSubject,
} from 'rxjs';
import {
  TradingService,
  CreateOrderRequest,
  OpenOrder,
} from '../../../core/services/trading.service';
import {
  PositionService,
  Position,
  CreatePositionRequest,
} from '../../../core/services/position.service';
import {
  WalletService,
  WalletBalance,
} from '../../../core/services/wallet.service';
import { TradingAccountService } from '../../../core/services/trading-account.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SignalRService } from '../../../core/services/signalr.service';
import {
  TradingPairsService,
  TradingPair,
} from '../../../core/services/trading-pairs.service';

// Types and Interfaces
export type TradingMode = 'spot' | 'cross';
export type OrderSide = 'buy' | 'sell';
export type OrderType = 'Market' | 'Limit';

interface TradingFormState {
  isLoading: boolean;
  isSubmitting: boolean;
  currentPrice: number;
  availableBalance: number;
  selectedPair: TradingPair | null;
  currentTradingAccount: any;
  walletBalances: WalletBalance[];
}

interface OrderValidation {
  minQuantity: number;
  maxQuantity: number;
  quantityStep: number;
  minNotional: number;
  pricePrecision: number;
  quantityPrecision: number;
}

@Component({
  selector: 'app-trading-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './trading-form.component.html',
  styleUrls: ['./trading-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TradingFormComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly stateSubject$ = new BehaviorSubject<TradingFormState>({
    isLoading: false,
    isSubmitting: false,
    currentPrice: 0,
    availableBalance: 0,
    selectedPair: null,
    currentTradingAccount: null,
    walletBalances: [],
  });

  // Service Injections
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly tradingService = inject(TradingService);
  private readonly positionService = inject(PositionService);
  private readonly walletService = inject(WalletService);
  private readonly tradingAccountService = inject(TradingAccountService);
  private readonly notificationService = inject(NotificationService);
  private readonly signalRService = inject(SignalRService);
  private readonly tradingPairsService = inject(TradingPairsService);

  // Form
  tradingForm!: FormGroup;

  // Component State
  currentTradingMode: TradingMode = 'spot';
  currentOrderSide: OrderSide = 'buy';
  showTradingModal = false;
  currentViewTab: 'positions' | 'orders' = 'orders';

  // Data
  positions: Position[] = [];
  openOrders: OpenOrder[] = [];
  isLoadingOrders = false;
  totalPnL = 0;

  // Configuration
  readonly leverageOptions = [1, 2, 5, 10, 20, 50, 100];
  readonly percentageOptions = [25, 50, 75, 100];
  readonly MIN_ORDER_VALUE_USDT = 10;

  // Validation Rules
  private orderValidation: OrderValidation = {
    minQuantity: 0.00001,
    maxQuantity: 100000,
    quantityStep: 0.00001,
    minNotional: 10,
    pricePrecision: 2,
    quantityPrecision: 5,
  };

  // Getters for template
  get state(): TradingFormState {
    return this.stateSubject$.value;
  }

  get isLoading(): boolean {
    return this.state.isLoading;
  }

  get isSubmitting(): boolean {
    return this.state.isSubmitting;
  }

  get currentPrice(): number {
    return this.state.currentPrice;
  }

  get availableBalance(): number {
    return this.state.availableBalance;
  }

  get selectedPair(): TradingPair | null {
    return this.state.selectedPair;
  }

  ngOnInit(): void {
    this.initializeForm();
    this.initializeComponent();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.resetModalState();
  }

  /**
   * Initialize the reactive form with custom validators
   */
  private initializeForm(): void {
    this.tradingForm = this.fb.group({
      orderType: ['Market', [Validators.required]],
      price: [
        { value: 0, disabled: true },
        [Validators.required, this.priceValidator.bind(this)],
      ],
      quantity: [
        0,
        [
          Validators.required,
          Validators.min(this.orderValidation.minQuantity),
          this.quantityValidator.bind(this),
        ],
      ],
      percentage: [0, [Validators.min(0), Validators.max(100)]],
      leverage: [
        1,
        [Validators.required, Validators.min(1), Validators.max(100)],
      ],
      stopLoss: [null, [this.stopLossValidator.bind(this)]],
      takeProfit: [null, [this.takeProfitValidator.bind(this)]],
      total: [{ value: 0, disabled: true }],
    });

    this.setupFormSubscriptions();
  }

  /**
   * Custom validator for price
   */
  private priceValidator(control: AbstractControl): ValidationErrors | null {
    const price = control.value;
    if (!price || price <= 0) {
      return { invalidPrice: 'Price must be greater than 0' };
    }
    return null;
  }

  /**
   * Custom validator for quantity
   */
  private quantityValidator(control: AbstractControl): ValidationErrors | null {
    const quantity = control.value;
    if (!quantity || quantity <= 0) {
      return { invalidQuantity: 'Quantity must be greater than 0' };
    }

    const total = quantity * (this.getFormPrice() || this.currentPrice);
    if (total < this.MIN_ORDER_VALUE_USDT) {
      return {
        minNotional: `Minimum order value is ${this.MIN_ORDER_VALUE_USDT} USDT`,
      };
    }

    return null;
  }

  /**
   * Custom validator for stop loss
   */
  private stopLossValidator(control: AbstractControl): ValidationErrors | null {
    if (!control.value) return null;

    const stopLoss = control.value;
    const entryPrice = this.getFormPrice() || this.currentPrice;

    if (this.currentOrderSide === 'buy' && stopLoss >= entryPrice) {
      return {
        invalidStopLoss:
          'Stop loss must be below entry price for long positions',
      };
    }

    if (this.currentOrderSide === 'sell' && stopLoss <= entryPrice) {
      return {
        invalidStopLoss:
          'Stop loss must be above entry price for short positions',
      };
    }

    return null;
  }

  /**
   * Custom validator for take profit
   */
  private takeProfitValidator(
    control: AbstractControl
  ): ValidationErrors | null {
    if (!control.value) return null;

    const takeProfit = control.value;
    const entryPrice = this.getFormPrice() || this.currentPrice;

    if (this.currentOrderSide === 'buy' && takeProfit <= entryPrice) {
      return {
        invalidTakeProfit:
          'Take profit must be above entry price for long positions',
      };
    }

    if (this.currentOrderSide === 'sell' && takeProfit >= entryPrice) {
      return {
        invalidTakeProfit:
          'Take profit must be below entry price for short positions',
      };
    }

    return null;
  }

  /**
   * Setup form value change subscriptions
   */
  private setupFormSubscriptions(): void {
    // Order type changes
    this.tradingForm
      .get('orderType')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((orderType) => {
        const priceControl = this.tradingForm.get('price');
        if (orderType === 'Market') {
          priceControl?.disable();
          priceControl?.setValue(this.currentPrice);
        } else {
          priceControl?.enable();
        }
        this.updateOrderTotal();
      });

    // Price changes
    this.tradingForm
      .get('price')
      ?.valueChanges.pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        distinctUntilChanged()
      )
      .subscribe(() => {
        this.updateOrderTotal();
        this.validateStopLossAndTakeProfit();
      });

    // Quantity changes
    this.tradingForm
      .get('quantity')
      ?.valueChanges.pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        distinctUntilChanged()
      )
      .subscribe((quantity) => {
        this.updateOrderTotal();
        this.updatePercentageFromQuantity();
      });

    // Percentage changes
    this.tradingForm
      .get('percentage')
      ?.valueChanges.pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        distinctUntilChanged(),
        filter((percentage) => percentage >= 0 && percentage <= 100)
      )
      .subscribe((percentage) => {
        this.calculateQuantityFromPercentage(percentage);
      });

    // Leverage changes
    this.tradingForm
      .get('leverage')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.updateMaxQuantity();
        this.updatePercentageFromQuantity();
      });
  }

  /**
   * Initialize component with data subscriptions
   */
  private async initializeComponent(): Promise<void> {
    this.updateState({ isLoading: true });

    try {
      // Load trading account first
      await this.loadTradingAccount();

      // Setup real-time subscriptions
      this.setupMarketDataSubscriptions();
      this.setupPositionSubscriptions();
      this.setupOrderSubscriptions();

      // Load initial data
      await this.loadInitialData();
    } catch (error) {
      this.handleError('Failed to initialize trading component', error);
    } finally {
      this.updateState({ isLoading: false });
    }
  }

  /**
   * Setup market data subscriptions
   */
  private setupMarketDataSubscriptions(): void {
    // Selected pair changes
    this.tradingPairsService.selectedPair$
      .pipe(
        takeUntil(this.destroy$),
        filter((pair) => pair !== null)
      )
      .subscribe((pair) => {
        this.updateState({ selectedPair: pair });
        this.updateOrderValidation(pair!);
        this.loadTickerData(pair!.symbol);
      });

    // Real-time price updates
    this.signalRService.tickerData$
      .pipe(
        takeUntil(this.destroy$),
        filter((data) => data.symbol === this.state.selectedPair?.symbol)
      )
      .subscribe((tickerData) => {
        this.updateState({ currentPrice: tickerData.lastPrice });
        if (this.tradingForm.get('orderType')?.value === 'Market') {
          this.tradingForm.patchValue({ price: tickerData.lastPrice });
        }
        this.updateOrderTotal();
      });
  }

  /**
   * Setup position subscriptions
   */
  private setupPositionSubscriptions(): void {
    this.positionService.positions$
      .pipe(takeUntil(this.destroy$))
      .subscribe((positions) => {
        this.positions = positions;
        this.calculateTotalPnL();
        this.cdr.markForCheck();
      });
  }

  /**
   * Setup order subscriptions
   */
  private setupOrderSubscriptions(): void {
    this.tradingService.openOrders$
      .pipe(takeUntil(this.destroy$))
      .subscribe((orders) => {
        this.openOrders = orders;
        this.cdr.markForCheck();
      });
  }

  /**
   * Load trading account
   */
  private async loadTradingAccount(): Promise<void> {
    const accounts = await this.tradingAccountService
      .getUserAccounts()
      .toPromise();

    if (!accounts || accounts.length === 0) {
      throw new Error('No trading accounts found');
    }

    const activeAccount =
      accounts.find((a) => a.status === 'Active') || accounts[0];
    this.updateState({ currentTradingAccount: activeAccount });
    this.tradingAccountService.setCurrentAccount(activeAccount);
  }

  /**
   * Load initial data
   */
  private async loadInitialData(): Promise<void> {
    const promises = [this.loadWalletBalances(), this.loadOpenOrders()];

    if (this.currentTradingMode === 'cross') {
      promises.push(this.loadPositions());
    }

    await Promise.all(promises);
  }

  /**
   * Load wallet balances
   */
  private async loadWalletBalances(): Promise<void> {
    if (!this.state.currentTradingAccount) return;

    try {
      const balances = await this.walletService
        .getWallets(this.state.currentTradingAccount.id)
        .toPromise();

      if (balances) {
        this.updateState({ walletBalances: balances });
        this.updateAvailableBalance();
      }
    } catch (error) {
      this.handleError('Failed to load wallet balances', error);
    }
  }

  /**
   * Update available balance based on selected pair and order side
   */
  private updateAvailableBalance(): void {
    const { walletBalances, selectedPair } = this.state;

    if (!walletBalances || !selectedPair) {
      this.updateState({ availableBalance: 0 });
      return;
    }

    let balance = 0;

    if (this.currentOrderSide === 'buy') {
      // For buy orders, use quote asset (usually USDT)
      const quoteBalance = walletBalances.find(
        (b) => b.currency === selectedPair.quoteAsset
      );
      balance = quoteBalance?.availableBalance || 0;
    } else {
      // For sell orders, use base asset
      const baseBalance = walletBalances.find(
        (b) => b.currency === selectedPair.baseAsset
      );
      balance = baseBalance?.availableBalance || 0;
    }

    this.updateState({ availableBalance: balance });
  }

  /**
   * Load ticker data for current pair
   */
  private async loadTickerData(symbol: string): Promise<void> {
    try {
      const tickerData = await this.tradingPairsService
        .getTickerData(symbol)
        .toPromise();

      if (tickerData) {
        this.updateState({ currentPrice: tickerData.lastPrice });
        if (this.tradingForm.get('orderType')?.value === 'Market') {
          this.tradingForm.patchValue({ price: tickerData.lastPrice });
        }
        this.updateOrderTotal();
      }
    } catch (error) {
      console.error('Failed to load ticker data:', error);
    }
  }

  /**
   * Load open positions
   */
  private async loadPositions(): Promise<void> {
    if (!this.state.currentTradingAccount) return;

    try {
      const positions = await this.positionService
        .getPositions(this.state.currentTradingAccount.id)
        .toPromise();

      this.positions = positions || [];
      this.calculateTotalPnL();
    } catch (error) {
      console.error('Failed to load positions:', error);
    }
  }

  /**
   * Load open orders
   */
  async loadOpenOrders(): Promise<void> {
    if (!this.state.currentTradingAccount?.id || this.isLoadingOrders) return;

    this.isLoadingOrders = true;
    this.cdr.markForCheck();

    try {
      const result = await this.tradingService
        .getOpenOrders(this.state.currentTradingAccount.id, 1, 20)
        .toPromise();

      if (result) {
        this.openOrders = result.items || [];
      }
    } catch (error) {
      this.handleError('Failed to load open orders', error);
    } finally {
      this.isLoadingOrders = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Update order validation based on trading pair
   */
  private updateOrderValidation(pair: TradingPair): void {
    if (!pair.filters) return;

    const lotSizeFilter = pair.filters.find((f) => f.filterType === 'LOT_SIZE');
    const priceFilter = pair.filters.find(
      (f) => f.filterType === 'PRICE_FILTER'
    );
    const notionalFilter = pair.filters.find(
      (f) => f.filterType === 'MIN_NOTIONAL'
    );

    if (lotSizeFilter) {
      this.orderValidation.minQuantity = lotSizeFilter.minQty || 0.00001;
      this.orderValidation.maxQuantity = lotSizeFilter.maxQty || 100000;
      this.orderValidation.quantityStep = lotSizeFilter.stepSize || 0.00001;
    }

    if (priceFilter) {
      this.orderValidation.pricePrecision = this.getPrecision(
        priceFilter.tickSize || 0.01
      );
    }

    if (notionalFilter) {
      this.orderValidation.minNotional = notionalFilter.minNotional || 10;
    }

    this.orderValidation.quantityPrecision = pair.baseAssetPrecision || 8;
  }

  /**
   * Get decimal precision from step size
   */
  private getPrecision(stepSize: number): number {
    const str = stepSize.toString();
    const decimalIndex = str.indexOf('.');
    return decimalIndex === -1 ? 0 : str.length - decimalIndex - 1;
  }

  /**
   * Update form total
   */
  private updateOrderTotal(): void {
    const quantity = this.tradingForm.get('quantity')?.value || 0;
    const price = this.getFormPrice() || this.currentPrice;
    const total = quantity * price;

    this.tradingForm.patchValue({ total }, { emitEvent: false });
  }

  /**
   * Calculate quantity from percentage
   */
  private calculateQuantityFromPercentage(percentage: number): void {
    if (!this.availableBalance || !this.currentPrice) return;

    const price = this.getFormPrice() || this.currentPrice;
    const leverage =
      this.currentTradingMode === 'cross'
        ? this.tradingForm.get('leverage')?.value || 1
        : 1;

    let maxQuantity = 0;

    if (this.currentOrderSide === 'buy') {
      const effectiveBalance = this.availableBalance * leverage;
      maxQuantity = effectiveBalance / price;
    } else {
      maxQuantity = this.availableBalance;
    }

    const quantity = this.roundToStep(
      (maxQuantity * percentage) / 100,
      this.orderValidation.quantityStep
    );

    this.tradingForm.patchValue({ quantity }, { emitEvent: false });
    this.updateOrderTotal();
  }

  /**
   * Update percentage from quantity
   */
  private updatePercentageFromQuantity(): void {
    const quantity = this.tradingForm.get('quantity')?.value || 0;
    if (!quantity || !this.availableBalance) {
      this.tradingForm.patchValue({ percentage: 0 }, { emitEvent: false });
      return;
    }

    const price = this.getFormPrice() || this.currentPrice;
    const leverage =
      this.currentTradingMode === 'cross'
        ? this.tradingForm.get('leverage')?.value || 1
        : 1;

    let maxQuantity = 0;

    if (this.currentOrderSide === 'buy') {
      const effectiveBalance = this.availableBalance * leverage;
      maxQuantity = effectiveBalance / price;
    } else {
      maxQuantity = this.availableBalance;
    }

    const percentage = Math.min(100, (quantity / maxQuantity) * 100);
    this.tradingForm.patchValue({ percentage }, { emitEvent: false });
  }

  /**
   * Update maximum allowed quantity
   */
  private updateMaxQuantity(): void {
    const maxQuantityValidator = this.getMaxQuantityValidator();
    this.tradingForm
      .get('quantity')
      ?.setValidators([
        Validators.required,
        Validators.min(this.orderValidation.minQuantity),
        maxQuantityValidator,
        this.quantityValidator.bind(this),
      ]);
    this.tradingForm.get('quantity')?.updateValueAndValidity();
  }

  /**
   * Get maximum quantity validator
   */
  private getMaxQuantityValidator(): (
    control: AbstractControl
  ) => ValidationErrors | null {
    return (control: AbstractControl): ValidationErrors | null => {
      const quantity = control.value;
      if (!quantity) return null;

      const maxAllowed = this.getMaxAllowedQuantity();
      if (quantity > maxAllowed) {
        return { maxQuantity: `Maximum allowed quantity is ${maxAllowed}` };
      }

      return null;
    };
  }

  /**
   * Get maximum allowed quantity based on balance and leverage
   */
  private getMaxAllowedQuantity(): number {
    if (!this.availableBalance || !this.currentPrice) return 0;

    const price = this.getFormPrice() || this.currentPrice;
    const leverage =
      this.currentTradingMode === 'cross'
        ? this.tradingForm.get('leverage')?.value || 1
        : 1;

    if (this.currentOrderSide === 'buy') {
      const effectiveBalance = this.availableBalance * leverage;
      return effectiveBalance / price;
    } else {
      return this.availableBalance;
    }
  }

  /**
   * Validate stop loss and take profit
   */
  private validateStopLossAndTakeProfit(): void {
    this.tradingForm.get('stopLoss')?.updateValueAndValidity();
    this.tradingForm.get('takeProfit')?.updateValueAndValidity();
  }

  /**
   * Calculate total P&L
   */
  private calculateTotalPnL(): void {
    this.totalPnL = this.positions.reduce(
      (sum, position) => sum + position.unrealizedPnL,
      0
    );
  }

  /**
   * Execute trade
   */
  async executeTrade(): Promise<void> {
    if (!this.isFormValid() || this.isSubmitting) return;

    this.updateState({ isSubmitting: true });

    try {
      const formValue = this.tradingForm.getRawValue();

      if (this.currentTradingMode === 'spot') {
        await this.executeSpotOrder(formValue);
      } else {
        await this.executeCrossOrder(formValue);
      }

      this.notificationService.showSuccess('Order placed successfully');
      this.resetForm();

      // Reload data
      await Promise.all([
        this.loadWalletBalances(),
        this.loadOpenOrders(),
        this.currentTradingMode === 'cross'
          ? this.loadPositions()
          : Promise.resolve(),
      ]);
    } catch (error: any) {
      this.handleError('Failed to execute trade', error);
    } finally {
      this.updateState({ isSubmitting: false });
    }
  }

  /**
   * Execute spot order
   */
  private async executeSpotOrder(formValue: any): Promise<void> {
    const request: CreateOrderRequest = {
      tradingAccountId: this.state.currentTradingAccount.id,
      symbol: this.state.selectedPair!.symbol,
      orderType: formValue.orderType,
      side: this.currentOrderSide === 'buy' ? 'Buy' : 'Sell',
      quantity: this.roundToStep(
        formValue.quantity,
        this.orderValidation.quantityStep
      ),
      price:
        formValue.orderType === 'Limit'
          ? this.roundToStep(
              formValue.price,
              Math.pow(10, -this.orderValidation.pricePrecision)
            )
          : undefined,
    };

    if (formValue.orderType === 'Market') {
      if (this.currentOrderSide === 'buy') {
        await this.tradingService
          .createMarketBuyOrder(
            request.tradingAccountId,
            request.symbol,
            request.quantity
          )
          .toPromise();
      } else {
        await this.tradingService
          .createMarketSellOrder(
            request.tradingAccountId,
            request.symbol,
            request.quantity
          )
          .toPromise();
      }
    } else {
      await this.tradingService
        .createLimitOrder(
          request.tradingAccountId,
          request.symbol,
          request.side,
          request.quantity,
          request.price!
        )
        .toPromise();
    }
  }

  /**
   * Execute cross/futures order
   */
  private async executeCrossOrder(formValue: any): Promise<void> {
    const request: CreatePositionRequest = {
      tradingAccountId: this.state.currentTradingAccount.id,
      symbol: this.state.selectedPair!.symbol,
      side: this.currentOrderSide === 'buy' ? 'Long' : 'Short',
      quantity: this.roundToStep(
        formValue.quantity,
        this.orderValidation.quantityStep
      ),
      leverage: formValue.leverage,
      stopLoss: formValue.stopLoss || undefined,
      takeProfit: formValue.takeProfit || undefined,
    };

    await this.positionService.openPosition(request).toPromise();
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId: string): Promise<void> {
    try {
      await this.tradingService.cancelOrder(orderId).toPromise();
      this.notificationService.showSuccess('Order cancelled successfully');
      await this.loadOpenOrders();
      await this.loadWalletBalances();
    } catch (error) {
      this.handleError('Failed to cancel order', error);
    }
  }

  /**
   * Close position
   */
  async closePosition(positionId: string): Promise<void> {
    try {
      await this.positionService.closePosition(positionId).toPromise();
      this.notificationService.showSuccess('Position closed successfully');
      await this.loadPositions();
      await this.loadWalletBalances();
    } catch (error) {
      this.handleError('Failed to close position', error);
    }
  }

  /**
   * Reset form to initial state
   */
  private resetForm(): void {
    this.tradingForm.patchValue({
      quantity: 0,
      percentage: 0,
      stopLoss: null,
      takeProfit: null,
      total: 0,
    });

    if (this.tradingForm.get('orderType')?.value === 'Limit') {
      this.tradingForm.patchValue({ price: this.currentPrice });
    }
  }

  // Public methods for template

  /**
   * Set trading mode
   */
  setTradingMode(mode: TradingMode): void {
    this.currentTradingMode = mode;

    if (mode === 'spot') {
      this.tradingForm.patchValue({ leverage: 1 });
      this.tradingForm.get('leverage')?.disable();
      this.tradingForm.get('stopLoss')?.disable();
      this.tradingForm.get('takeProfit')?.disable();
    } else {
      this.tradingForm.get('leverage')?.enable();
      this.tradingForm.get('stopLoss')?.enable();
      this.tradingForm.get('takeProfit')?.enable();
    }

    this.updateMaxQuantity();
    this.updatePercentageFromQuantity();
  }

  /**
   * Set order side
   */
  setOrderSide(side: OrderSide): void {
    this.currentOrderSide = side;
    this.updateAvailableBalance();
    this.updateMaxQuantity();
    this.validateStopLossAndTakeProfit();
  }

  /**
   * Set order type
   */
  setOrderType(type: OrderType): void {
    this.tradingForm.patchValue({ orderType: type });
  }

  /**
   * Set percentage
   */
  setPercentage(percentage: number): void {
    this.tradingForm.patchValue({ percentage });
  }

  /**
   * Switch view tab
   */
  switchViewTab(tab: 'positions' | 'orders'): void {
    this.currentViewTab = tab;
    if (tab === 'orders' && !this.isLoadingOrders) {
      this.loadOpenOrders();
    }
  }

  /**
   * Open trading modal
   */
  openTradingModal(mode: TradingMode): void {
    this.setTradingMode(mode);
    this.showTradingModal = true;
    document.body.style.overflow = 'hidden';
  }

  /**
   * Close trading modal
   */
  closeTradingModal(): void {
    this.showTradingModal = false;
    this.resetModalState();
  }

  /**
   * Check if form is valid
   */
  isFormValid(): boolean {
    return this.tradingForm.valid && !this.isSubmitting;
  }

  // Utility methods

  /**
   * Get form price
   */
  private getFormPrice(): number {
    return this.tradingForm.get('price')?.value || 0;
  }

  /**
   * Round to step
   */
  private roundToStep(value: number, step: number): number {
    return Math.round(value / step) * step;
  }

  /**
   * Format price
   */
  formatPrice(price: number): string {
    if (!price) return '0.00';

    if (price >= 1) {
      return price.toFixed(2);
    } else if (price >= 0.01) {
      return price.toFixed(4);
    } else {
      return price.toFixed(8);
    }
  }

  /**
   * Format size
   */
  formatSize(size: number): string {
    if (!size) return '0';

    if (size >= 1) {
      return size.toFixed(3);
    } else {
      return size.toFixed(this.orderValidation.quantityPrecision);
    }
  }

  /**
   * Format P&L
   */
  formatPnL(pnl: number): string {
    const formatted = Math.abs(pnl).toFixed(2);
    return pnl >= 0 ? `+$${formatted}` : `-$${formatted}`;
  }

  /**
   * Get P&L class
   */
  getPnLClass(pnl: number): string {
    return pnl >= 0 ? 'text-green-400' : 'text-red-400';
  }

  /**
   * Get order side class
   */
  getOrderSideClass(side: string): string {
    return side.toLowerCase() === 'buy'
      ? 'text-green-400 bg-green-950/50 border-green-800/50'
      : 'text-red-400 bg-red-950/50 border-red-800/50';
  }

  /**
   * Get status class
   */
  getStatusClass(status: string): string {
    const statusMap: Record<string, string> = {
      pending: 'text-yellow-400 bg-yellow-950/50 border-yellow-800/50',
      open: 'text-yellow-400 bg-yellow-950/50 border-yellow-800/50',
      partiallyfilled: 'text-blue-400 bg-blue-950/50 border-blue-800/50',
      filled: 'text-green-400 bg-green-950/50 border-green-800/50',
      cancelled: 'text-red-400 bg-red-950/50 border-red-800/50',
      rejected: 'text-red-400 bg-red-950/50 border-red-800/50',
    };

    return (
      statusMap[status.toLowerCase()] ||
      'text-gray-400 bg-gray-950/50 border-gray-800/50'
    );
  }

  /**
   * Track by position ID
   */
  trackByPositionId(index: number, position: Position): string {
    return position.id;
  }

  /**
   * Track by order ID
   */
  trackByOrderId(index: number, order: OpenOrder): string {
    return order.id;
  }

  /**
   * Handle escape key
   */
  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent): void {
    if (this.showTradingModal) {
      this.closeTradingModal();
    }
  }

  /**
   * Update component state
   */
  private updateState(partial: Partial<TradingFormState>): void {
    this.stateSubject$.next({
      ...this.state,
      ...partial,
    });
    this.cdr.markForCheck();
  }

  /**
   * Handle errors
   */
  private handleError(message: string, error: any): void {
    console.error(message, error);
    const errorMessage =
      error?.error?.detail || error?.message || 'An error occurred';
    this.notificationService.showError(`${message}: ${errorMessage}`);
  }

  /**
   * Reset modal state
   */
  private resetModalState(): void {
    document.body.style.overflow = 'auto';
  }

  calcPerc(pct: number) {
    return Math.abs((this.tradingForm.get('percentage')?.value || 0) - pct) < 1;
  }
}
