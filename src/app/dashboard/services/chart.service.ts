import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, interval } from 'rxjs';
import { map } from 'rxjs/operators';
import { LineData, CandlestickData } from 'lightweight-charts';

export interface ChartDataUpdate {
  lineData: LineData;
  candlestickData: CandlestickData;
}

@Injectable({
  providedIn: 'root'
})
export class ChartService {
  private lineDataSubject = new BehaviorSubject<LineData[]>([]);
  private candlestickDataSubject = new BehaviorSubject<CandlestickData[]>([]);

  public lineData$ = this.lineDataSubject.asObservable();
  public candlestickData$ = this.candlestickDataSubject.asObservable();

  private currentPrice = 100;
  private lastTime = Math.floor(Date.now() / 1000);

  constructor() {
    this.generateInitialData();
  }

  private generateInitialData(): void {
    const lineData: LineData[] = [];
    const candlestickData: CandlestickData[] = [];

    const baseTime = new Date('2024-01-01').getTime() / 1000;
    let price = this.currentPrice;

    for (let i = 0; i < 100; i++) {
      const time = (baseTime + i * 24 * 60 * 60) as any;
      price += (Math.random() - 0.5) * 4;

      lineData.push({
        time: time,
        value: price
      });

      const open = price + (Math.random() - 0.5) * 2;
      const high = Math.max(open, price) + Math.random() * 3;
      const low = Math.min(open, price) - Math.random() * 3;
      const close = price;

      candlestickData.push({
        time: time,
        open: open,
        high: high,
        low: low,
        close: close
      });
    }

    this.currentPrice = price;
    this.lastTime = lineData[lineData.length - 1].time as number;

    this.lineDataSubject.next(lineData);
    this.candlestickDataSubject.next(candlestickData);
  }

  // Start real-time data stream
  public startRealTimeData(): Observable<ChartDataUpdate> {
    return interval(2000).pipe( // Update every 2 seconds
      map(() => {
        this.lastTime += 60; // Add 1 minute
        this.currentPrice += (Math.random() - 0.5) * 4;

        const lineData: LineData = {
          time: this.lastTime as any,
          value: this.currentPrice
        };

        const open = this.currentPrice + (Math.random() - 0.5) * 2;
        const high = Math.max(open, this.currentPrice) + Math.random() * 3;
        const low = Math.min(open, this.currentPrice) - Math.random() * 3;
        const close = this.currentPrice;

        const candlestickData: CandlestickData = {
          time: this.lastTime as any,
          open: open,
          high: high,
          low: low,
          close: close
        };

        return { lineData, candlestickData };
      })
    );
  }

  // Add single data point
  public addDataPoint(): ChartDataUpdate {
    this.lastTime += 24 * 60 * 60; // Add 1 day
    this.currentPrice += (Math.random() - 0.5) * 4;

    const lineData: LineData = {
      time: this.lastTime as any,
      value: this.currentPrice
    };

    const open = this.currentPrice + (Math.random() - 0.5) * 2;
    const high = Math.max(open, this.currentPrice) + Math.random() * 3;
    const low = Math.min(open, this.currentPrice) - Math.random() * 3;
    const close = this.currentPrice;

    const candlestickData: CandlestickData = {
      time: this.lastTime as any,
      open: open,
      high: high,
      low: low,
      close: close
    };

    // Update subjects
    const currentLineData = this.lineDataSubject.value;
    const currentCandlestickData = this.candlestickDataSubject.value;

    this.lineDataSubject.next([...currentLineData, lineData]);
    this.candlestickDataSubject.next([...currentCandlestickData, candlestickData]);

    return { lineData, candlestickData };
  }

  // Get current data
  public getCurrentLineData(): LineData[] {
    return this.lineDataSubject.value;
  }

  public getCurrentCandlestickData(): CandlestickData[] {
    return this.candlestickDataSubject.value;
  }

  // Simulate fetching data from API
  public fetchHistoricalData(symbol: string, period: string): Promise<{ lineData: LineData[], candlestickData: CandlestickData[] }> {
    return new Promise((resolve) => {
      // Simulate API delay
      setTimeout(() => {
        this.generateInitialData();
        resolve({
          lineData: this.getCurrentLineData(),
          candlestickData: this.getCurrentCandlestickData()
        });
      }, 1000);
    });
  }
}
