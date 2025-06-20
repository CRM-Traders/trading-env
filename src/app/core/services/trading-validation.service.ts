import { Injectable } from '@angular/core';
import { TradingPair } from './trading-pairs.service';

export interface OrderValidationRules {
  minQuantity: number;
  maxQuantity: number;
  quantityStep: number;
  minPrice: number;
  maxPrice: number;
  priceStep: number;
  minNotional: number;
  maxNotional?: number;
  quantityPrecision: number;
  pricePrecision: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

@Injectable({
  providedIn: 'root',
})
export class TradingValidationService {
  private readonly DEFAULT_RULES: OrderValidationRules = {
    minQuantity: 0.00001,
    maxQuantity: 100000,
    quantityStep: 0.00001,
    minPrice: 0.01,
    maxPrice: 1000000,
    priceStep: 0.01,
    minNotional: 10,
    quantityPrecision: 5,
    pricePrecision: 2,
  };

  /**
   * Extract validation rules from trading pair filters
   */
  extractValidationRules(pair: TradingPair): OrderValidationRules {
    const rules = { ...this.DEFAULT_RULES };

    if (!pair.filters) return rules;

    // LOT_SIZE filter
    const lotSizeFilter = pair.filters.find(
      (f: any) => f.filterType === 'LOT_SIZE'
    );
    if (lotSizeFilter) {
      rules.minQuantity = lotSizeFilter.minQty || rules.minQuantity;
      rules.maxQuantity = lotSizeFilter.maxQty || rules.maxQuantity;
      rules.quantityStep = lotSizeFilter.stepSize || rules.quantityStep;
    }

    // PRICE_FILTER
    const priceFilter = pair.filters.find(
      (f: any) => f.filterType === 'PRICE_FILTER'
    );
    if (priceFilter) {
      rules.minPrice = priceFilter.minPrice || rules.minPrice;
      rules.maxPrice = priceFilter.maxPrice || rules.maxPrice;
      rules.priceStep = priceFilter.tickSize || rules.priceStep;
      rules.pricePrecision = this.getPrecisionFromStep(
        priceFilter.tickSize || rules.priceStep
      );
    }

    // MIN_NOTIONAL filter
    const notionalFilter = pair.filters.find(
      (f: any) => f.filterType === 'MIN_NOTIONAL'
    );
    if (notionalFilter) {
      rules.minNotional = notionalFilter.minNotional || rules.minNotional;
    }

    // NOTIONAL filter (for max notional)
    const maxNotionalFilter = pair.filters.find(
      (f: any) => f.filterType === 'NOTIONAL'
    );
    // if (maxNotionalFilter && maxNotionalFilter.minNotional) {
    //   rules.maxNotional = maxNotionalFilter.minNotional;
    // }

    // Set precision from pair configuration
    rules.quantityPrecision = pair.baseAssetPrecision || 8;
    rules.pricePrecision = pair.quoteAssetPrecision || 8;

    return rules;
  }

  validateOrder(
    orderType: 'Market' | 'Limit',
    side: 'Buy' | 'Sell',
    price: number,
    quantity: number,
    rules: OrderValidationRules,
    availableBalance: number,
    leverage: number = 1
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Quantity validation
    if (quantity < rules.minQuantity) {
      errors.push(
        `Minimum quantity is ${this.formatNumber(
          rules.minQuantity,
          rules.quantityPrecision
        )}`
      );
    }

    if (quantity > rules.maxQuantity) {
      errors.push(
        `Maximum quantity is ${this.formatNumber(
          rules.maxQuantity,
          rules.quantityPrecision
        )}`
      );
    }

    if (!this.isValidStep(quantity, rules.quantityStep)) {
      errors.push(`Quantity must be a multiple of ${rules.quantityStep}`);
    }

    // Price validation (for limit orders)
    if (orderType === 'Limit') {
      if (price < rules.minPrice) {
        errors.push(
          `Minimum price is ${this.formatNumber(
            rules.minPrice,
            rules.pricePrecision
          )}`
        );
      }

      if (price > rules.maxPrice) {
        errors.push(
          `Maximum price is ${this.formatNumber(
            rules.maxPrice,
            rules.pricePrecision
          )}`
        );
      }

      if (!this.isValidStep(price, rules.priceStep)) {
        errors.push(`Price must be a multiple of ${rules.priceStep}`);
      }
    }

    // Notional validation
    const notional = quantity * price;
    if (notional < rules.minNotional) {
      errors.push(`Minimum order value is ${rules.minNotional} USDT`);
    }

    if (rules.maxNotional && notional > rules.maxNotional) {
      errors.push(`Maximum order value is ${rules.maxNotional} USDT`);
    }

    // Balance validation
    if (side === 'Buy') {
      const requiredBalance = notional / leverage;
      if (requiredBalance > availableBalance) {
        errors.push(
          `Insufficient balance. Required: ${this.formatNumber(
            requiredBalance,
            2
          )} USDT`
        );
      }

      // Warning for high leverage
      if (leverage > 50) {
        warnings.push('High leverage increases liquidation risk');
      }
    } else {
      if (quantity > availableBalance) {
        errors.push(
          `Insufficient balance. Available: ${this.formatNumber(
            availableBalance,
            rules.quantityPrecision
          )}`
        );
      }
    }

    // Market volatility warning
    if (orderType === 'Market' && notional > 10000) {
      warnings.push('Large market orders may experience significant slippage');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Calculate position risk metrics
   */
  calculatePositionRisk(
    side: 'Long' | 'Short',
    entryPrice: number,
    quantity: number,
    leverage: number,
    accountBalance: number
  ): {
    margin: number;
    liquidationPrice: number;
    maxLoss: number;
    riskPercentage: number;
  } {
    const positionValue = entryPrice * quantity;
    const margin = positionValue / leverage;
    const maintenanceMarginRate = 0.005; // 0.5% maintenance margin

    let liquidationPrice: number;
    if (side === 'Long') {
      liquidationPrice =
        entryPrice * (1 - (1 - maintenanceMarginRate) / leverage);
    } else {
      liquidationPrice =
        entryPrice * (1 + (1 - maintenanceMarginRate) / leverage);
    }

    const maxLoss = margin;
    const riskPercentage = (maxLoss / accountBalance) * 100;

    return {
      margin,
      liquidationPrice,
      maxLoss,
      riskPercentage,
    };
  }

  /**
   * Round a value to the nearest valid step
   */
  roundToStep(value: number, step: number): number {
    const precision = this.getPrecisionFromStep(step);
    const rounded = Math.round(value / step) * step;
    return parseFloat(rounded.toFixed(precision));
  }

  /**
   * Check if a value is a valid multiple of step
   */
  private isValidStep(value: number, step: number): boolean {
    const precision = this.getPrecisionFromStep(step);
    const multiplier = Math.pow(10, precision);
    const valueInt = Math.round(value * multiplier);
    const stepInt = Math.round(step * multiplier);
    return valueInt % stepInt === 0;
  }

  /**
   * Get decimal precision from step size
   */
  private getPrecisionFromStep(step: number): number {
    if (step >= 1) return 0;
    const str = step.toString();
    const decimalIndex = str.indexOf('.');
    if (decimalIndex === -1) return 0;
    return str.length - decimalIndex - 1;
  }

  /**
   * Format number with specific precision
   */
  private formatNumber(value: number, precision: number): string {
    return value.toFixed(precision).replace(/\.?0+$/, '');
  }

  /**
   * Calculate order fees
   */
  calculateOrderFees(
    orderType: 'Market' | 'Limit',
    side: 'Buy' | 'Sell',
    quantity: number,
    price: number,
    isMaker: boolean = false
  ): {
    feeRate: number;
    feeAmount: number;
    feeCurrency: string;
    totalCost: number;
  } {
    // Standard fee rates (can be adjusted based on VIP level)
    const makerFeeRate = 0.001; // 0.1%
    const takerFeeRate = 0.001; // 0.1%

    const feeRate =
      orderType === 'Limit' && isMaker ? makerFeeRate : takerFeeRate;
    const notional = quantity * price;

    let feeAmount: number;
    let feeCurrency: string;
    let totalCost: number;

    if (side === 'Buy') {
      // Fee is paid in base currency for buy orders
      feeAmount = quantity * feeRate;
      feeCurrency = 'BTC'; // This should be dynamic based on trading pair
      totalCost = notional; // Total USDT spent
    } else {
      // Fee is paid in quote currency for sell orders
      feeAmount = notional * feeRate;
      feeCurrency = 'USDT'; // This should be dynamic based on trading pair
      totalCost = notional - feeAmount; // Total USDT received after fees
    }

    return {
      feeRate,
      feeAmount,
      feeCurrency,
      totalCost,
    };
  }

  /**
   * Suggest optimal order parameters
   */
  suggestOrderParameters(
    availableBalance: number,
    currentPrice: number,
    side: 'Buy' | 'Sell',
    riskPercentage: number,
    rules: OrderValidationRules
  ): {
    suggestedQuantity: number;
    suggestedLeverage: number;
    estimatedPnL: { profit: number; loss: number };
  } {
    // Calculate position size based on risk percentage
    const riskAmount = availableBalance * (riskPercentage / 100);

    // Suggest conservative leverage
    const suggestedLeverage = Math.min(
      10,
      Math.max(1, Math.floor(100 / riskPercentage))
    );

    // Calculate suggested quantity
    let suggestedQuantity: number;
    if (side === 'Buy') {
      const maxNotional = availableBalance * suggestedLeverage;
      suggestedQuantity = maxNotional / currentPrice;
    } else {
      suggestedQuantity = availableBalance * (riskPercentage / 100);
    }

    // Round to valid step
    suggestedQuantity = this.roundToStep(
      Math.min(suggestedQuantity, rules.maxQuantity),
      rules.quantityStep
    );

    // Ensure minimum notional
    const notional = suggestedQuantity * currentPrice;
    if (notional < rules.minNotional) {
      suggestedQuantity = this.roundToStep(
        rules.minNotional / currentPrice,
        rules.quantityStep
      );
    }

    // Estimate P&L (5% price movement)
    const priceMovement = 0.05;
    const profit =
      suggestedQuantity * currentPrice * priceMovement * suggestedLeverage;
    const loss =
      suggestedQuantity * currentPrice * priceMovement * suggestedLeverage;

    return {
      suggestedQuantity,
      suggestedLeverage,
      estimatedPnL: { profit, loss },
    };
  }
}
