// src/app/dashboard/components/chart/chart.component.ts
import { CommonModule } from '@angular/common';
import {
  Component,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  HostListener,
  inject,
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil, filter, debounceTime } from 'rxjs/operators';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  LineData,
  ColorType,
  LineSeries,
  CandlestickSeries,
  AreaSeries,
  HistogramSeries,
  UTCTimestamp,
} from 'lightweight-charts';
import {
  TradingPairsService,
  TradingPair,
} from '../../../core/services/trading-pairs.service';
import {
  SignalRService,
  WebSocketTickerData,
} from '../../../core/services/signalr.service';

interface ChartData {
  candles: CandlestickData[];
  line: LineData[];
  volume: any[];
}

@Component({
  selector: 'app-chart',
  imports: [CommonModule],
  templateUrl: './chart.component.html',
  styleUrl: './chart.component.scss',
})
export class ChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mainChart', { static: false }) mainChartRef!: ElementRef;
  @ViewChild('volumeChart', { static: false }) volumeChartRef!: ElementRef;

  private readonly destroy$ = new Subject<void>();
  private readonly tradingPairsService = inject(TradingPairsService);
  private readonly signalRService = inject(SignalRService);

  // Chart configuration
  selectedTimeframe = '1h';
  selectedChartType = 'candlestick';

  // Market data
  dailyVolume = 0;
  dailyHigh = 0;
  dailyLow = 0;

  // Current trading pair
  selectedPair: TradingPair | null = null;

  // Chart instances
  private mainChart: IChartApi | null = null;
  private volumeChart: IChartApi | null = null;
  private candlestickSeries: ISeriesApi<'Candlestick'> | null = null;
  private lineSeries: ISeriesApi<'Line'> | null = null;
  private areaSeries: ISeriesApi<'Area'> | null = null;
  private volumeSeries: ISeriesApi<'Histogram'> | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // Chart data management
  private chartDataCache = new Map<string, ChartData>();
  private currentPrice = 0;

  // Data aggregation for candlesticks
  private currentCandle: CandlestickData | null = null;
  private candleStartTime = 0;

  timeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];
  chartTypes = ['candlestick', 'line', 'area'];

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.initializeCharts();
      this.setupResizeObserver();
      this.setupDataSubscriptions();
    }, 150);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.cleanup();
  }

  private setupDataSubscriptions(): void {
    // Subscribe to selected pair changes
    this.tradingPairsService.selectedPair$
      .pipe(takeUntil(this.destroy$))
      .subscribe((pair) => {
        if (pair && pair.symbol !== this.selectedPair?.symbol) {
          this.selectedPair = pair;
          this.onPairChanged();
        }
      });

    // Subscribe to real-time ticker data
    this.signalRService.tickerData$
      .pipe(
        takeUntil(this.destroy$),
        filter((data) => data.symbol === this.selectedPair?.symbol),
        debounceTime(100) // Prevent too frequent updates
      )
      .subscribe((tickerData) => {
        this.updateMarketStats(tickerData);
        this.updateChartWithTickerData(tickerData);
      });
  }

  private async onPairChanged(): Promise<void> {
    if (!this.selectedPair) return;

    try {
      // Initialize empty chart data for the new pair
      this.initializeEmptyChartData(this.selectedPair.symbol);

      // Load historical data from API
      await this.loadHistoricalDataFromAPI(this.selectedPair.symbol);

      // Setup real-time subscription
      await this.subscribeToRealTimeData(this.selectedPair.symbol);

      // Update chart with data
      this.updateChart();
    } catch (error) {
      console.error('Failed to setup data for new pair:', error);
    }
  }

  private initializeEmptyChartData(symbol: string): void {
    this.chartDataCache.set(symbol, {
      candles: [],
      line: [],
      volume: [],
    });
    this.currentCandle = null;
    this.candleStartTime = 0;
  }

  private async loadHistoricalDataFromAPI(symbol: string): Promise<void> {
    try {
      // Load initial ticker data to get current price
      const tickerData = await this.tradingPairsService
        .getTickerData(symbol)
        .toPromise();
      if (tickerData) {
        this.currentPrice = tickerData.lastPrice;
        this.dailyVolume = tickerData.quoteVolume;
        this.dailyHigh = tickerData.highPrice;
        this.dailyLow = tickerData.lowPrice;

        // Create initial data point from ticker
        this.createInitialDataFromTicker(symbol, tickerData);
      }
    } catch (error) {
      console.error(`Failed to load historical data for ${symbol}:`, error);
    }
  }

  private createInitialDataFromTicker(symbol: string, tickerData: any): void {
    const cachedData = this.chartDataCache.get(symbol);
    if (!cachedData) return;

    const currentTime = Math.floor(Date.now() / 1000) as UTCTimestamp;

    // Create initial line data point
    cachedData.line.push({
      time: currentTime,
      value: tickerData.lastPrice,
    });

    // Create initial candle
    this.currentCandle = {
      time: currentTime,
      open: tickerData.openPrice,
      high: tickerData.highPrice,
      low: tickerData.lowPrice,
      close: tickerData.lastPrice,
    };

    // Create initial volume data
    cachedData.volume.push({
      time: currentTime,
      value: tickerData.volume,
      color:
        tickerData.lastPrice >= tickerData.openPrice ? '#10B981' : '#EF4444',
    });
  }

  private async subscribeToRealTimeData(symbol: string): Promise<void> {
    try {
      // Unsubscribe from previous symbol
      const activeSubscriptions = this.signalRService.getActiveSubscriptions();
      for (const activeSymbol of activeSubscriptions.tickers) {
        if (activeSymbol !== symbol) {
          await this.signalRService.unsubscribeFromTicker(activeSymbol);
        }
      }

      // Subscribe to new symbol
      if (!activeSubscriptions.tickers.includes(symbol)) {
        await this.signalRService.subscribeToTicker(symbol);
      }
    } catch (error) {
      console.error(
        `Failed to subscribe to real-time data for ${symbol}:`,
        error
      );
    }
  }

  private updateMarketStats(tickerData: WebSocketTickerData): void {
    this.dailyVolume = tickerData.totalTradedQuoteAssetVolume;
    this.dailyHigh = tickerData.highPrice;
    this.dailyLow = tickerData.lowPrice;
    this.currentPrice = tickerData.lastPrice;
  }

  private updateChartWithTickerData(tickerData: WebSocketTickerData): void {
    if (!this.selectedPair) return;

    const timestamp = Math.floor(tickerData.eventTime / 1000) as UTCTimestamp;
    const price = tickerData.lastPrice;
    const volume = tickerData.totalTradedBaseAssetVolume;

    // Update line data
    this.updateLineData(timestamp, price);

    // Update or create candlestick data
    this.updateCandlestickData(timestamp, price, volume, tickerData);

    // Update volume data
    this.updateVolumeData(timestamp, volume);

    // Refresh the chart if it's visible
    if (this.mainChart && this.volumeChart) {
      this.refreshChartSeries();
    }
  }

  private updateLineData(timestamp: UTCTimestamp, price: number): void {
    if (!this.selectedPair) return;

    const cachedData = this.chartDataCache.get(this.selectedPair.symbol);
    if (!cachedData) return;

    // Add new line data point
    cachedData.line.push({
      time: timestamp,
      value: price,
    });

    // Keep only last 1000 points for performance
    if (cachedData.line.length > 1000) {
      cachedData.line = cachedData.line.slice(-1000);
    }
  }

  private updateCandlestickData(
    timestamp: UTCTimestamp,
    price: number,
    volume: number,
    tickerData: WebSocketTickerData
  ): void {
    if (!this.selectedPair) return;

    const cachedData = this.chartDataCache.get(this.selectedPair.symbol);
    if (!cachedData) return;

    const timeframeMinutes = this.getTimeframeMinutes();
    const candleTime =
      Math.floor(timestamp / (timeframeMinutes * 60)) * (timeframeMinutes * 60);

    // Check if we need to create a new candle or update existing one
    if (!this.currentCandle || this.candleStartTime !== candleTime) {
      // Finalize previous candle if it exists
      if (this.currentCandle) {
        cachedData.candles.push(this.currentCandle);
      }

      // Start new candle
      this.currentCandle = {
        time: candleTime as UTCTimestamp,
        open: price,
        high: price,
        low: price,
        close: price,
      };
      this.candleStartTime = candleTime;
    } else {
      // Update existing candle
      this.currentCandle.high = Math.max(this.currentCandle.high, price);
      this.currentCandle.low = Math.min(this.currentCandle.low, price);
      this.currentCandle.close = price;
    }

    // Keep only last 500 candles for performance
    if (cachedData.candles.length > 500) {
      cachedData.candles = cachedData.candles.slice(-500);
    }
  }

  private updateVolumeData(timestamp: UTCTimestamp, volume: number): void {
    if (!this.selectedPair) return;

    const cachedData = this.chartDataCache.get(this.selectedPair.symbol);
    if (!cachedData) return;

    const timeframeMinutes = this.getTimeframeMinutes();
    const volumeTime =
      Math.floor(timestamp / (timeframeMinutes * 60)) * (timeframeMinutes * 60);

    // Find or create volume data for this time period
    let volumeEntry = cachedData.volume.find((v) => v.time === volumeTime);

    if (!volumeEntry) {
      volumeEntry = {
        time: volumeTime as UTCTimestamp,
        value: volume,
        color:
          this.currentPrice >= (this.currentCandle?.open || this.currentPrice)
            ? '#10B981'
            : '#EF4444',
      };
      cachedData.volume.push(volumeEntry);
    } else {
      volumeEntry.value = volume;
      volumeEntry.color =
        this.currentPrice >= (this.currentCandle?.open || this.currentPrice)
          ? '#10B981'
          : '#EF4444';
    }

    // Keep only last 500 volume points
    if (cachedData.volume.length > 500) {
      cachedData.volume = cachedData.volume.slice(-500);
    }
  }

  private refreshChartSeries(): void {
    if (!this.selectedPair || !this.mainChart || !this.volumeChart) return;

    const cachedData = this.chartDataCache.get(this.selectedPair.symbol);
    if (!cachedData) return;

    try {
      // Update main chart series based on selected type
      switch (this.selectedChartType) {
        case 'candlestick':
          if (this.candlestickSeries) {
            // Add current candle to display if it exists
            const candlesToDisplay = [...cachedData.candles];
            if (this.currentCandle) {
              candlesToDisplay.push(this.currentCandle);
            }
            this.candlestickSeries.setData(candlesToDisplay);
          }
          break;
        case 'line':
          if (this.lineSeries) {
            this.lineSeries.setData(cachedData.line);
          }
          break;
        case 'area':
          if (this.areaSeries) {
            this.areaSeries.setData(cachedData.line);
          }
          break;
      }

      // Update volume series
      if (this.volumeSeries) {
        this.volumeSeries.setData(cachedData.volume);
      }
    } catch (error) {
      console.error('Error refreshing chart series:', error);
    }
  }

  public setTimeframe(timeframe: string): void {
    this.selectedTimeframe = timeframe;
    this.resetCandleAggregation();
    this.updateChart();
  }

  public setChartType(type: string): void {
    this.selectedChartType = type;
    this.updateChart();
  }

  private resetCandleAggregation(): void {
    this.currentCandle = null;
    this.candleStartTime = 0;

    // Clear cached candles for current pair to regenerate with new timeframe
    if (this.selectedPair) {
      const cachedData = this.chartDataCache.get(this.selectedPair.symbol);
      if (cachedData) {
        cachedData.candles = [];
        // Regenerate candles from line data if available
        this.regenerateCandlesFromLineData(cachedData);
      }
    }
  }

  private regenerateCandlesFromLineData(cachedData: ChartData): void {
    if (cachedData.line.length === 0) return;

    const timeframeMinutes = this.getTimeframeMinutes();
    const candleMap = new Map<number, CandlestickData>();

    // Group line data into candles
    cachedData.line.forEach((point) => {
      const candleTime =
        Math.floor((point.time as number) / (timeframeMinutes * 60)) *
        (timeframeMinutes * 60);

      let candle = candleMap.get(candleTime);
      if (!candle) {
        candle = {
          time: candleTime as UTCTimestamp,
          open: point.value,
          high: point.value,
          low: point.value,
          close: point.value,
        };
        candleMap.set(candleTime, candle);
      } else {
        candle.high = Math.max(candle.high, point.value);
        candle.low = Math.min(candle.low, point.value);
        candle.close = point.value;
      }
    });

    // Convert map to sorted array
    cachedData.candles = Array.from(candleMap.values()).sort(
      (a, b) => (a.time as number) - (b.time as number)
    );
  }

  public refreshCharts(): void {
    console.log('Refreshing charts...');

    if (this.mainChart && this.volumeChart) {
      this.handleResize();
      this.updateChart();
    } else {
      console.log('Charts not initialized, reinitializing...');
      this.cleanup();
      setTimeout(() => this.initializeCharts(), 100);
    }
  }

  @HostListener('window:resize', ['$event'])
  onWindowResize(): void {
    this.handleResize();
  }

  private cleanup(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    if (this.mainChart) {
      this.mainChart.remove();
      this.mainChart = null;
    }

    if (this.volumeChart) {
      this.volumeChart.remove();
      this.volumeChart = null;
    }

    this.candlestickSeries = null;
    this.lineSeries = null;
    this.areaSeries = null;
    this.volumeSeries = null;
  }

  private setupResizeObserver(): void {
    if (!this.mainChartRef?.nativeElement) return;

    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });

    this.resizeObserver.observe(this.mainChartRef.nativeElement);

    if (this.volumeChartRef?.nativeElement) {
      this.resizeObserver.observe(this.volumeChartRef.nativeElement);
    }
  }

  private handleResize(): void {
    requestAnimationFrame(() => {
      if (this.mainChart && this.mainChartRef?.nativeElement) {
        const container = this.mainChartRef.nativeElement;
        const rect = container.getBoundingClientRect();

        if (rect.width > 0 && rect.height > 0) {
          this.mainChart.applyOptions({
            width: rect.width,
            height: rect.height,
          });
        }
      }

      if (this.volumeChart && this.volumeChartRef?.nativeElement) {
        const container = this.volumeChartRef.nativeElement;
        const rect = container.getBoundingClientRect();

        if (rect.width > 0 && rect.height > 0) {
          this.volumeChart.applyOptions({
            width: rect.width,
            height: rect.height,
          });
        }
      }
    });
  }

  private initializeCharts(): void {
    if (
      !this.mainChartRef?.nativeElement ||
      !this.volumeChartRef?.nativeElement
    ) {
      setTimeout(() => this.initializeCharts(), 100);
      return;
    }

    const mainContainer = this.mainChartRef.nativeElement;
    const volumeContainer = this.volumeChartRef.nativeElement;

    const mainRect = mainContainer.getBoundingClientRect();
    const volumeRect = volumeContainer.getBoundingClientRect();

    if (mainRect.width === 0 || mainRect.height === 0) {
      setTimeout(() => this.initializeCharts(), 100);
      return;
    }

    const commonOptions = {
      layout: {
        background: { type: ColorType.Solid, color: '#1F2937' },
        textColor: '#D1D5DB',
      },
      grid: {
        vertLines: { color: '#374151' },
        horzLines: { color: '#374151' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: '#485563',
      },
      timeScale: {
        borderColor: '#485563',
      },
    };

    this.mainChart = createChart(mainContainer, {
      ...commonOptions,
      width: mainRect.width,
      height: mainRect.height,
      timeScale: {
        ...commonOptions.timeScale,
        timeVisible: true,
        secondsVisible: false,
      },
    });

    this.volumeChart = createChart(volumeContainer, {
      ...commonOptions,
      width: volumeRect.width,
      height: volumeRect.height,
      timeScale: {
        ...commonOptions.timeScale,
        visible: false,
      },
    });

    this.updateChart();
  }

  private updateChart(): void {
    if (!this.mainChart || !this.volumeChart) {
      return;
    }

    this.clearSeries();

    const data = this.getCurrentChartData();

    // Create appropriate series based on chart type
    switch (this.selectedChartType) {
      case 'candlestick':
        this.candlestickSeries = this.mainChart.addSeries(CandlestickSeries, {
          upColor: '#10B981',
          downColor: '#EF4444',
          borderVisible: false,
          wickUpColor: '#10B981',
          wickDownColor: '#EF4444',
        });
        this.candlestickSeries.setData(data.candles);
        break;

      case 'line':
        this.lineSeries = this.mainChart.addSeries(LineSeries, {
          color: '#3B82F6',
          lineWidth: 2,
        });
        this.lineSeries.setData(data.line);
        break;

      case 'area':
        this.areaSeries = this.mainChart.addSeries(AreaSeries, {
          topColor: 'rgba(59, 130, 246, 0.56)',
          bottomColor: 'rgba(59, 130, 246, 0.04)',
          lineColor: '#3B82F6',
          lineWidth: 2,
        });
        this.areaSeries.setData(data.line);
        break;
    }

    this.volumeSeries = this.volumeChart.addSeries(HistogramSeries, {
      color: '#6B7280',
      priceFormat: {
        type: 'volume',
      },
    });
    this.volumeSeries.setData(data.volume);

    this.mainChart.timeScale().fitContent();
    this.volumeChart.timeScale().fitContent();
  }

  private getCurrentChartData(): ChartData {
    if (this.selectedPair) {
      const cachedData = this.chartDataCache.get(this.selectedPair.symbol);
      if (cachedData) {
        // Include current candle in candlestick data
        const candlesToDisplay = [...cachedData.candles];
        if (this.currentCandle && this.selectedChartType === 'candlestick') {
          candlesToDisplay.push(this.currentCandle);
        }

        return {
          candles: candlesToDisplay,
          line: cachedData.line,
          volume: cachedData.volume,
        };
      }
    }

    // Return empty data if no cached data available
    return { candles: [], line: [], volume: [] };
  }

  private clearSeries(): void {
    if (this.candlestickSeries) {
      this.mainChart?.removeSeries(this.candlestickSeries);
      this.candlestickSeries = null;
    }
    if (this.lineSeries) {
      this.mainChart?.removeSeries(this.lineSeries);
      this.lineSeries = null;
    }
    if (this.areaSeries) {
      this.mainChart?.removeSeries(this.areaSeries);
      this.areaSeries = null;
    }
    if (this.volumeSeries) {
      this.volumeChart?.removeSeries(this.volumeSeries);
      this.volumeSeries = null;
    }
  }

  private getTimeframeMinutes(): number {
    const timeframeMap: { [key: string]: number } = {
      '1m': 1,
      '5m': 5,
      '15m': 15,
      '30m': 30,
      '1h': 60,
      '4h': 240,
      '1d': 1440,
      '1w': 10080,
    };
    return timeframeMap[this.selectedTimeframe] || 60;
  }
}
