import { DOCUMENT } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostListener, Inject, Input, OnChanges, ViewChild } from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-finance-chart',
  templateUrl: './finance-chart.component.html',
  styleUrls: ['./finance-chart.component.scss'],
  standalone: false,
})
export class FinanceChartComponent implements AfterViewInit, OnChanges {
  @Input() type: 'bar' | 'pie' = 'bar';
  @Input() labels: string[] = [];
  @Input() datasetLabel = '';
  @Input() data: number[] = [];
  @Input() palette: 'default' | 'artist-vivid' | 'category-vivid' = 'default';

  @ViewChild('canvasRef') canvasRef?: ElementRef<HTMLCanvasElement>;
  private chart?: Chart;

  constructor(@Inject(DOCUMENT) private readonly document: Document) {}

  ngAfterViewInit(): void {
    this.renderChart();
  }

  ngOnChanges(): void {
    this.renderChart();
  }

  @HostListener('window:finanzas-theme-change')
  onFinanceThemeChange(): void {
    this.renderChart();
  }

  private renderChart(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    this.chart?.destroy();
    const isDark = this.document.body.classList.contains('finanzas-dark-theme');
    const textColor = isDark ? '#dbe6ff' : '#475467';
    const gridColor = isDark ? 'rgba(148, 163, 184, .18)' : 'rgba(71, 84, 103, .12)';

    const config: ChartConfiguration = {
      type: this.type,
      data: {
        labels: this.labels,
        datasets: [
          {
            label: this.datasetLabel,
            data: this.data,
            backgroundColor: this.getBackgroundColors(),
            borderColor: this.type === 'bar' ? this.getBorderColors() : undefined,
            borderWidth: this.type === 'bar' ? 1.2 : 0,
            borderRadius: this.type === 'bar' ? 10 : 0,
            hoverBackgroundColor: this.getHoverBackgroundColors(),
            hoverBorderColor: this.type === 'bar' ? this.getBorderColors() : undefined,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: {
              color: textColor,
            },
          },
        },
        scales: this.type === 'bar' ? {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: { ticks: { color: textColor }, grid: { color: gridColor } },
        } : undefined,
      },
    };

    this.chart = new Chart(canvas, config);
  }

  private getBackgroundColors(): string[] {
    if (this.palette === 'artist-vivid') {
      return ['#22D3EE', '#38BDF8', '#60A5FA', '#818CF8', '#A78BFA', '#F472B6', '#FB7185', '#F59E0B'];
    }
    if (this.palette === 'category-vivid') {
      return ['#0EA5E9', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#14B8A6', '#F43F5E', '#3B82F6'];
    }
    return ['#111827', '#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed'];
  }

  private getHoverBackgroundColors(): string[] {
    if (this.palette === 'artist-vivid') {
      return ['#67E8F9', '#7DD3FC', '#93C5FD', '#A5B4FC', '#C4B5FD', '#F9A8D4', '#FDA4AF', '#FBBF24'];
    }
    if (this.palette === 'category-vivid') {
      return ['#38BDF8', '#4ADE80', '#FBBF24', '#F87171', '#A78BFA', '#2DD4BF', '#FB7185', '#60A5FA'];
    }
    return this.getBackgroundColors();
  }

  private getBorderColors(): string[] {
    if (this.palette === 'artist-vivid') {
      return ['#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#F43F5E', '#D97706'];
    }
    if (this.palette === 'category-vivid') {
      return ['#0284C7', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#0F766E', '#E11D48', '#1D4ED8'];
    }
    return ['#0F172A', '#1D4ED8', '#047857', '#B45309', '#B91C1C', '#6D28D9'];
  }
}
