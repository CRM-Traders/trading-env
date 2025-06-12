import { CommonModule } from '@angular/common';
import { Component, ViewChild, ElementRef, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
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
  HistogramSeries
} from 'lightweight-charts';

interface TradingPair {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}
@Component({
  selector: 'app-chart',
  imports: [CommonModule],
  templateUrl: './chart.component.html',
  styleUrl: './chart.component.scss'
})
export class ChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mainChart', { static: false }) mainChartRef!: ElementRef;
  @ViewChild('volumeChart', { static: false }) volumeChartRef!: ElementRef;

  selectedTimeframe = '1h';
  selectedChartType = 'candlestick';
  dailyVolume = 1248750000;
  dailyHigh = 45250.75;
  dailyLow = 43180.25;

  selectedPair: TradingPair = {
    symbol: 'BTCUSD',
    name: 'Bitcoin',
    price: 44250.50,
    change: 1240.25,
    changePercent: 2.89
  };

  private mainChart: IChartApi | null = null;
  private volumeChart: IChartApi | null = null;
  private candlestickSeries: ISeriesApi<'Candlestick'> | null = null;
  private lineSeries: ISeriesApi<'Line'> | null = null;
  private areaSeries: ISeriesApi<'Area'> | null = null;
  private volumeSeries: ISeriesApi<'Histogram'> | null = null;
  private resizeObserver: ResizeObserver | null = null;

  timeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];
  chartTypes = ['candle', 'line', 'area'];

  ngAfterViewInit() {
    setTimeout(() => {
      this.initializeCharts();
      this.setupResizeObserver();
    }, 150);
  }

  ngOnDestroy() {
    this.cleanup();
  }

  setTimeframe(timeframe: string): void {
    this.selectedTimeframe = timeframe;
    this.updateChart();
  }

  setChartType(type: string): void {
    this.selectedChartType = type;
    this.updateChart();
  }

  refreshCharts(): void {
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

  private cleanup() {
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

  private initializeCharts() {
    if (!this.mainChartRef?.nativeElement || !this.volumeChartRef?.nativeElement) {
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

  private updateChart() {
    if (!this.mainChart || !this.volumeChart) {
      return;
    }

    this.clearSeries();

    const data = this.generateSampleData();

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

  private clearSeries() {
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

  private generateSampleData() {
    const basePrice = this.selectedPair?.price || 44250;
    const candleData: CandlestickData[] = [];
    const lineData: LineData[] = [];
    const volumeData: any[] = [];

    const now = Math.floor(Date.now() / 1000);
    const timeframeMinutes = this.getTimeframeMinutes();

    for (let i = 100; i >= 0; i--) {
      const time = now - (i * timeframeMinutes * 60);
      const randomFactor = 1 + (Math.random() - 0.5) * 0.02;
      const price = basePrice * randomFactor;

      const open = price * (1 + (Math.random() - 0.5) * 0.01);
      const close = price * (1 + (Math.random() - 0.5) * 0.01);
      const high = Math.max(open, close) * (1 + Math.random() * 0.005);
      const low = Math.min(open, close) * (1 - Math.random() * 0.005);
      const volume = Math.random() * 1000000 + 100000;

      candleData.push({
        time: time as any,
        open,
        high,
        low,
        close,
      });

      lineData.push({
        time: time as any,
        value: close,
      });

      volumeData.push({
        time: time as any,
        value: volume,
        color: close > open ? '#10B981' : '#EF4444',
      });
    }

    return {
      candles: candleData,
      line: lineData,
      volume: volumeData,
    };
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
