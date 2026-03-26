import { Panel } from './Panel';
import {
  getRealityPropertySource,
  subscribeRealityPropertySourceChange,
} from '@/services/reality-source-settings';
import { escapeHtml } from '@/utils/sanitize';

type CityStat = {
  city: string;
  count: number;
  median_price: number | null;
  median_price_per_m2: number | null;
  p10_price_per_m2: number | null;
  p90_price_per_m2: number | null;
};

type StatsResponse = {
  total_active: number;
  sample_size: number;
  excluded_count: number;
  by_city: CityStat[];
  by_source: Record<string, number>;
  methodology?: string;
  source: string;
};

const REFRESH_MS = 120 * 1000;

export class MarketStatsPanel extends Panel {
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribeSourceChange: (() => void) | null = null;

  constructor() {
    super({
      id: 'market-stats',
      title: 'Tržní statistiky',
      className: 'panel-wide',
    });
    void this.loadStats();
    this.refreshTimer = setInterval(() => void this.loadStats(), REFRESH_MS);
    this.unsubscribeSourceChange = subscribeRealityPropertySourceChange(() => {
      void this.loadStats();
    });
  }

  private async loadStats(): Promise<void> {
    try {
      const params = new URLSearchParams();
      const source = getRealityPropertySource();
      if (source !== 'all') params.set('source', source);
      const query = params.toString() ? `?${params.toString()}` : '';

      const res = await fetch(`/api/market-stats${query}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as StatsResponse;
      this.renderStats(data);
    } catch {
      this.renderFallback();
    }
  }

  private renderStats(data: StatsResponse): void {
    const cities = data.by_city;

    const metricsHtml = [
      { label: 'Aktivní byty', value: String(data.total_active), change: `${data.sample_size} ve vzorku` },
      { label: 'Vyřazené outliery', value: String(data.excluded_count), change: 'price=1, extrémy, mimo rozsah' },
      ...cities.slice(0, 3).map((c) => ({
        label: `Medián cena/m² ${c.city}`,
        value: c.median_price_per_m2 ? `${c.median_price_per_m2.toLocaleString('cs-CZ')} Kč` : 'N/A',
        change: c.p10_price_per_m2 && c.p90_price_per_m2
          ? `P10–P90 ${this.formatCompactRange(c.p10_price_per_m2, c.p90_price_per_m2)}`
          : `${c.count} nabídek`,
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
        <td class="city-price">${c.median_price_per_m2 ? c.median_price_per_m2.toLocaleString('cs-CZ') + ' Kč' : 'N/A'}</td>
        <td>${c.p10_price_per_m2 && c.p90_price_per_m2 ? this.formatCompactRange(c.p10_price_per_m2, c.p90_price_per_m2) : 'N/A'}</td>
        <td class="city-volume">${c.count}</td>
      </tr>
    `).join('');

    const sourceInfo = data.source === 'supabase' ? '(očištěná bytová nabídka)' : '(demo)';

    this.setContent(`
      <div class="market-stats-source">${escapeHtml(sourceInfo)}</div>
      <div class="market-stats-note">Metodika: jen aktivní byty, vyřazené záznamy bez reálné ceny a extrémy mimo rozumný rozsah. Kontrola jednotky podle metodiky ČSÚ v Kč/m².</div>
      <div class="market-stats-grid">${metricsHtml}</div>
      <div class="market-stats-chart">
        <div class="chart-title">Medián nabídkové ceny/m² dle města</div>
        ${priceBar}
      </div>
      <div class="market-stats-table">
        <table>
          <thead>
            <tr><th>Město</th><th>Medián cena/m²</th><th>P10–P90</th><th>Vzorek</th></tr>
          </thead>
          <tbody>${cityRows}</tbody>
        </table>
      </div>
    `);
  }

  private renderPriceChart(cities: CityStat[]): string {
    const withPrice = cities.filter((c) => c.median_price_per_m2 != null);
    if (withPrice.length === 0) return '<div class="bar-chart"><em>Žádná data</em></div>';

    const maxPrice = Math.max(...withPrice.map((d) => d.median_price_per_m2 || 0));
    const bars = withPrice.map((d) => {
      const pct = ((d.median_price_per_m2 || 0) / maxPrice) * 100;
      const color = d.city === 'Praha' ? '#44ff88' : d.city === 'Brno' ? '#4488ff' : '#ff8844';
      return `
        <div class="bar-row">
          <span class="bar-label">${escapeHtml(d.city)}</span>
          <div class="bar-track">
            <div class="bar-fill" style="width:${pct.toFixed(1)}%;background:${color}"></div>
          </div>
          <span class="bar-value">${((d.median_price_per_m2 || 0) / 1000).toFixed(1)}k</span>
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

  private formatCompactRange(min: number, max: number): string {
    return `${Math.round(min / 1000)}–${Math.round(max / 1000)}k`;
  }

  destroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.unsubscribeSourceChange?.();
    this.unsubscribeSourceChange = null;
    super.destroy();
  }
}
