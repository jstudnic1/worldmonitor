import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';

type CityStat = {
  city: string;
  count: number;
  avg_price: number;
  median_price: number;
  avg_price_per_m2: number | null;
  avg_area_m2: number;
  min_price: number;
  max_price: number;
};

type TypeStat = {
  type: string;
  count: number;
  avg_price: number;
};

type StatsResponse = {
  total_active: number;
  by_city: CityStat[];
  by_type: TypeStat[];
  by_source: Record<string, number>;
  source: string;
};

const REFRESH_MS = 120 * 1000;

export class MarketStatsPanel extends Panel {
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({
      id: 'market-stats',
      title: 'Tržní statistiky',
      className: 'panel-wide',
    });
    void this.loadStats();
    this.refreshTimer = setInterval(() => void this.loadStats(), REFRESH_MS);
  }

  private async loadStats(): Promise<void> {
    try {
      const res = await fetch('/api/market-stats');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as StatsResponse;
      this.renderStats(data);
    } catch {
      this.renderFallback();
    }
  }

  private renderStats(data: StatsResponse): void {
    const cities = data.by_city;
    const types = data.by_type;

    const metricsHtml = [
      { label: 'Aktivních nabídek', value: String(data.total_active), change: '' },
      ...cities.slice(0, 3).map((c) => ({
        label: `Ø cena/m² ${c.city}`,
        value: c.avg_price_per_m2 ? `${(c.avg_price_per_m2).toLocaleString('cs-CZ')} Kč` : 'N/A',
        change: `${c.count} nabídek`,
      })),
      ...types.slice(0, 2).map((t) => ({
        label: `${t.type} (Ø cena)`,
        value: this.formatPrice(t.avg_price),
        change: `${t.count} ks`,
      })),
    ].map((m) => `
        <div class="market-metric">
          <div class="metric-label">${escapeHtml(m.label)}</div>
          <div class="metric-value">${escapeHtml(m.value)}</div>
          <div class="metric-change metric-neutral">${escapeHtml(m.change)}</div>
        </div>
      `).join('');

    const priceBar = this.renderPriceChart(cities);

    const cityRows = cities.map((c) => `
      <tr>
        <td class="city-name">${escapeHtml(c.city)}</td>
        <td class="city-price">${c.avg_price_per_m2 ? (c.avg_price_per_m2).toLocaleString('cs-CZ') + ' Kč' : 'N/A'}</td>
        <td>${this.formatPrice(c.median_price)}</td>
        <td class="city-volume">${c.count}</td>
      </tr>
    `).join('');

    const sourceInfo = data.source === 'supabase' ? '(živá data)' : '(demo)';

    this.setContent(`
      <div class="market-stats-source">${escapeHtml(sourceInfo)}</div>
      <div class="market-stats-grid">${metricsHtml}</div>
      <div class="market-stats-chart">
        <div class="chart-title">Průměrná cena/m² dle města</div>
        ${priceBar}
      </div>
      <div class="market-stats-table">
        <table>
          <thead>
            <tr><th>Město</th><th>Cena/m²</th><th>Medián</th><th>Nabídek</th></tr>
          </thead>
          <tbody>${cityRows}</tbody>
        </table>
      </div>
    `);
  }

  private renderPriceChart(cities: CityStat[]): string {
    const withPrice = cities.filter((c) => c.avg_price_per_m2 != null);
    if (withPrice.length === 0) return '<div class="bar-chart"><em>Žádná data</em></div>';

    const maxPrice = Math.max(...withPrice.map((d) => d.avg_price_per_m2!));
    const bars = withPrice.map((d) => {
      const pct = (d.avg_price_per_m2! / maxPrice) * 100;
      const color = d.city === 'Praha' ? '#44ff88' : d.city === 'Brno' ? '#4488ff' : '#ff8844';
      return `
        <div class="bar-row">
          <span class="bar-label">${escapeHtml(d.city)}</span>
          <div class="bar-track">
            <div class="bar-fill" style="width:${pct.toFixed(1)}%;background:${color}"></div>
          </div>
          <span class="bar-value">${(d.avg_price_per_m2! / 1000).toFixed(1)}k</span>
        </div>
      `;
    }).join('');
    return `<div class="bar-chart">${bars}</div>`;
  }

  private renderFallback(): void {
    this.setContent(`
      <div class="market-stats-grid">
        <div class="market-metric">
          <div class="metric-label">Stav</div>
          <div class="metric-value">Načítám...</div>
          <div class="metric-change metric-neutral">Připojuji se k databázi</div>
        </div>
      </div>
    `);
  }

  private formatPrice(price: number): string {
    if (price >= 1000000) {
      return (price / 1000000).toFixed(1).replace('.0', '') + ' mil. Kč';
    }
    return price.toLocaleString('cs-CZ') + ' Kč';
  }

  destroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    super.destroy();
  }
}
