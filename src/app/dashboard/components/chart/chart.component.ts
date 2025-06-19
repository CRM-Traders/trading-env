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
import { takeUntil, filter, debounceTime, switchMap } from 'rxjs/operators';
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
  HistoricalDataPoint,
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
  private isLoadingHistoricalData = false;

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
      .pipe(
        takeUntil(this.destroy$),
        filter((pair) => pair !== null),
        switchMap((pair) => {
          if (pair && pair.symbol !== this.selectedPair?.symbol) {
            this.selectedPair = pair;
            return this.loadCompleteDataForPair(pair);
          }
          return [];
        })
      )
      .subscribe({
        next: () => {},
        error: (error) => {},
      });

    // Subscribe to real-time ticker data
    this.signalRService.tickerData$
      .pipe(
        takeUntil(this.destroy$),
        filter((data) => data.symbol === this.selectedPair?.symbol),
        debounceTime(100)
      )
      .subscribe((tickerData) => {
        this.updateMarketStats(tickerData);
        this.updateChartWithTickerData(tickerData);
      });
  }

  private async loadCompleteDataForPair(pair: TradingPair): Promise<void> {
    if (!pair) return;

    try {
      this.isLoadingHistoricalData = true;

      // Initialize empty chart data
      this.initializeEmptyChartData(pair.symbol);

      // Load historical data
      await this.loadHistoricalDataFromAPI(pair.symbol);

      // Setup real-time subscription
      await this.subscribeToRealTimeData(pair.symbol);

      // Update chart with loaded data
      this.updateChart();

      this.isLoadingHistoricalData = false;
    } catch (error) {
      this.isLoadingHistoricalData = false;
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
      const interval = this.getIntervalString();
      const limit = 500;

      // Fetch historical data
      const historicalData = await this.tradingPairsService
        .getHistoricalData(symbol, interval, limit)
        .toPromise();

      if (historicalData && historicalData.length > 0) {
        this.processHistoricalData(symbol, historicalData);
      }

      // Fetch current ticker data for real-time stats
      const tickerData = await this.tradingPairsService
        .getTickerData(symbol)
        .toPromise();

      if (tickerData) {
        this.currentPrice = tickerData.lastPrice;
        this.dailyVolume = tickerData.quoteVolume;
        this.dailyHigh = tickerData.highPrice;
        this.dailyLow = tickerData.lowPrice;
      }
    } catch (error) {
      console.error(`Failed to load historical data for ${symbol}:`, error);
      // Create fallback data if API fails
      this.createFallbackData(symbol);
    }
  }

  private processHistoricalData(
    symbol: string,
    historicalData: HistoricalDataPoint[]
  ): void {
    const cachedData = this.chartDataCache.get(symbol);
    if (!cachedData) return;

    // Process candlestick data
    cachedData.candles = historicalData.map((point) => ({
      time: point.time as UTCTimestamp,
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
    }));

    // Process line data
    cachedData.line = historicalData.map((point) => ({
      time: point.time as UTCTimestamp,
      value: point.close,
    }));

    // Process volume data
    cachedData.volume = historicalData.map((point) => ({
      time: point.time as UTCTimestamp,
      value: point.volume,
      color: point.close >= point.open ? '#10B981' : '#EF4444',
    }));

    // Set the last data point as current candle
    const lastCandle = cachedData.candles[cachedData.candles.length - 1];
    if (lastCandle) {
      this.currentCandle = { ...lastCandle };
      this.candleStartTime = lastCandle.time as number;
      this.currentPrice = lastCandle.close;
    }
  }

  private createFallbackData(symbol: string): void {
    const cachedData = this.chartDataCache.get(symbol);
    if (!cachedData) return;

    const now = Math.floor(Date.now() / 1000);
    const timeframeMinutes = this.getTimeframeMinutes();
    const interval = timeframeMinutes * 60;
    const basePrice = 45000; // Fallback price for demonstration

    // Generate 100 fallback data points
    for (let i = 99; i >= 0; i--) {
      const time = (now - i * interval) as UTCTimestamp;
      const price = basePrice + (Math.random() - 0.5) * 2000;
      const open = price + (Math.random() - 0.5) * 100;
      const high = Math.max(open, price) + Math.random() * 50;
      const low = Math.min(open, price) - Math.random() * 50;
      const close = price;
      const volume = Math.random() * 1000000;

      cachedData.candles.push({
        time,
        open,
        high,
        low,
        close,
      });

      cachedData.line.push({
        time,
        value: close,
      });

      cachedData.volume.push({
        time,
        value: volume,
        color: close >= open ? '#10B981' : '#EF4444',
      });
    }

    // Set current price and stats
    const lastCandle = cachedData.candles[cachedData.candles.length - 1];
    if (lastCandle) {
      this.currentPrice = lastCandle.close;
      this.dailyHigh = Math.max(...cachedData.candles.map((c) => c.high));
      this.dailyLow = Math.min(...cachedData.candles.map((c) => c.low));
      this.dailyVolume = cachedData.volume.reduce((sum, v) => sum + v.value, 0);
    }
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

    // Update the last line data point or add a new one
    if (cachedData.line.length > 0) {
      const lastPoint = cachedData.line[cachedData.line.length - 1];
      if (Math.abs((lastPoint.time as number) - (timestamp as number)) < 60) {
        // Update existing point if within 1 minute
        lastPoint.value = price;
      } else {
        // Add new point
        cachedData.line.push({
          time: timestamp,
          value: price,
        });
      }
    } else {
      cachedData.line.push({
        time: timestamp,
        value: price,
      });
    }

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
      if (this.currentCandle && cachedData.candles.length > 0) {
        const lastCandleIndex = cachedData.candles.length - 1;
        cachedData.candles[lastCandleIndex] = { ...this.currentCandle };
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

      // Add new candle to the array
      if (
        cachedData.candles.length === 0 ||
        cachedData.candles[cachedData.candles.length - 1].time !== candleTime
      ) {
        cachedData.candles.push({ ...this.currentCandle });
      }
    } else {
      // Update existing candle
      this.currentCandle.high = Math.max(this.currentCandle.high, price);
      this.currentCandle.low = Math.min(this.currentCandle.low, price);
      this.currentCandle.close = price;

      // Update the last candle in the array
      if (cachedData.candles.length > 0) {
        const lastCandleIndex = cachedData.candles.length - 1;
        cachedData.candles[lastCandleIndex] = { ...this.currentCandle };
      }
    }

    // Keep only last 1000 candles for performance
    if (cachedData.candles.length > 1000) {
      cachedData.candles = cachedData.candles.slice(-1000);
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

    // Keep only last 1000 volume points
    if (cachedData.volume.length > 1000) {
      cachedData.volume = cachedData.volume.slice(-1000);
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
          if (this.candlestickSeries && cachedData.candles.length > 0) {
            this.candlestickSeries.setData(cachedData.candles);
          }
          break;
        case 'line':
          if (this.lineSeries && cachedData.line.length > 0) {
            this.lineSeries.setData(cachedData.line);
          }
          break;
        case 'area':
          if (this.areaSeries && cachedData.line.length > 0) {
            this.areaSeries.setData(cachedData.line);
          }
          break;
      }

      // Update volume series
      if (this.volumeSeries && cachedData.volume.length > 0) {
        this.volumeSeries.setData(cachedData.volume);
      }
    } catch (error) {
      console.error('Error refreshing chart series:', error);
    }
  }

  public setTimeframe(timeframe: string): void {
    this.selectedTimeframe = timeframe;
    this.resetCandleAggregation();

    if (this.selectedPair) {
      this.loadCompleteDataForPair(this.selectedPair);
    }
  }

  public setChartType(type: string): void {
    this.selectedChartType = type;
    this.updateChart();
  }

  private resetCandleAggregation(): void {
    this.currentCandle = null;
    this.candleStartTime = 0;

    // Clear cached data for current pair to regenerate with new timeframe
    if (this.selectedPair) {
      this.chartDataCache.delete(this.selectedPair.symbol);
    }
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

    if (data.candles.length === 0 && data.line.length === 0) {
      console.log('No data available for chart');
      return;
    }

    // Create appropriate series based on chart type
    switch (this.selectedChartType) {
      case 'candlestick':
        if (data.candles.length > 0) {
          this.candlestickSeries = this.mainChart.addSeries(CandlestickSeries, {
            upColor: '#10B981',
            downColor: '#EF4444',
            borderVisible: false,
            wickUpColor: '#10B981',
            wickDownColor: '#EF4444',
          });
          this.candlestickSeries.setData(data.candles);
        }
        break;

      case 'line':
        if (data.line.length > 0) {
          this.lineSeries = this.mainChart.addSeries(LineSeries, {
            color: '#3B82F6',
            lineWidth: 2,
          });
          this.lineSeries.setData(data.line);
        }
        break;

      case 'area':
        if (data.line.length > 0) {
          this.areaSeries = this.mainChart.addSeries(AreaSeries, {
            topColor: 'rgba(59, 130, 246, 0.56)',
            bottomColor: 'rgba(59, 130, 246, 0.04)',
            lineColor: '#3B82F6',
            lineWidth: 2,
          });
          this.areaSeries.setData(data.line);
        }
        break;
    }

    if (data.volume.length > 0) {
      this.volumeSeries = this.volumeChart.addSeries(HistogramSeries, {
        color: '#6B7280',
        priceFormat: {
          type: 'volume',
        },
      });
      this.volumeSeries.setData(data.volume);
    }

    this.mainChart.timeScale().fitContent();
    this.volumeChart.timeScale().fitContent();
  }

  private getCurrentChartData(): ChartData {
    if (this.selectedPair) {
      const cachedData = this.chartDataCache.get(this.selectedPair.symbol);
      if (cachedData) {
        return {
          candles: cachedData.candles,
          line: cachedData.line,
          volume: cachedData.volume,
        };
      }
    }

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

  private getIntervalString(): string {
    const intervalMap: { [key: string]: string } = {
      '1m': '1m',
      '5m': '5m',
      '15m': '15m',
      '30m': '30m',
      '1h': '1h',
      '4h': '4h',
      '1d': '1d',
      '1w': '1w',
    };
    return intervalMap[this.selectedTimeframe] || '1h';
  }
}
