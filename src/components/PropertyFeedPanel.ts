import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';

type Property = {
  id: string;
  title: string;
  type: string;
  price: number;
  price_per_m2: number;
  area_m2: number;
  rooms: string;
  city: string;
  district: string;
  status: string;
  listed_at: string;
  image_url?: string;
};

type TabId = 'sale' | 'rent' | 'new';

const REFRESH_MS = 60 * 1000;

export class PropertyFeedPanel extends Panel {
  private activeTab: TabId = 'sale';
  private properties: Property[] = [];
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({
      id: 'property-feed',
      title: 'Nabídky nemovitostí',
      showCount: true,
      className: 'panel-wide',
    });
    void this.loadData();
    this.refreshTimer = setInterval(() => void this.loadData(), REFRESH_MS);
  }

  private async loadData(): Promise<void> {
    try {
      const res = await fetch(`/api/properties?type=${this.activeTab}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { properties: Property[] };
      this.properties = data.properties;
      this.setCount(this.properties.length);
      this.renderContent();
    } catch {
      this.renderFallbackData();
    }
  }

  private renderFallbackData(): void {
    // Seed data for demo when API not yet connected
    this.properties = [
      { id: '1', title: 'Byt 3+kk, Vinohrady', type: 'byt', price: 8950000, price_per_m2: 119333, area_m2: 75, rooms: '3+kk', city: 'Praha', district: 'Vinohrady', status: 'aktivní', listed_at: '2026-03-20' },
      { id: '2', title: 'Byt 2+1, Smíchov', type: 'byt', price: 6200000, price_per_m2: 103333, area_m2: 60, rooms: '2+1', city: 'Praha', district: 'Smíchov', status: 'aktivní', listed_at: '2026-03-19' },
      { id: '3', title: 'Rodinný dům, Černošice', type: 'dům', price: 12500000, price_per_m2: 78125, area_m2: 160, rooms: '5+1', city: 'Černošice', district: 'Praha-západ', status: 'rezervace', listed_at: '2026-03-18' },
      { id: '4', title: 'Byt 1+kk, Karlín', type: 'byt', price: 4800000, price_per_m2: 133333, area_m2: 36, rooms: '1+kk', city: 'Praha', district: 'Karlín', status: 'aktivní', listed_at: '2026-03-21' },
      { id: '5', title: 'Byt 4+kk, Dejvice', type: 'byt', price: 15200000, price_per_m2: 126667, area_m2: 120, rooms: '4+kk', city: 'Praha', district: 'Dejvice', status: 'aktivní', listed_at: '2026-03-17' },
      { id: '6', title: 'Komerční prostor, Centrum', type: 'komerční', price: 22000000, price_per_m2: 91667, area_m2: 240, rooms: '-', city: 'Praha', district: 'Praha 1', status: 'aktivní', listed_at: '2026-03-16' },
      { id: '7', title: 'Byt 2+kk, Brno-střed', type: 'byt', price: 4200000, price_per_m2: 84000, area_m2: 50, rooms: '2+kk', city: 'Brno', district: 'Brno-střed', status: 'aktivní', listed_at: '2026-03-21' },
      { id: '8', title: 'Pozemek, Říčany', type: 'pozemek', price: 3600000, price_per_m2: 4500, area_m2: 800, rooms: '-', city: 'Říčany', district: 'Praha-východ', status: 'aktivní', listed_at: '2026-03-15' },
    ];
    this.setCount(this.properties.length);
    this.renderContent();
  }

  private renderContent(): void {
    const tabs = `
      <div class="panel-tabs">
        <button class="panel-tab ${this.activeTab === 'sale' ? 'active' : ''}" data-tab="sale">
          <span class="tab-label">Prodej</span>
        </button>
        <button class="panel-tab ${this.activeTab === 'rent' ? 'active' : ''}" data-tab="rent">
          <span class="tab-label">Pronájem</span>
        </button>
        <button class="panel-tab ${this.activeTab === 'new' ? 'active' : ''}" data-tab="new">
          <span class="tab-label">Nové</span>
        </button>
      </div>
    `;

    const rows = this.properties.length > 0
      ? this.properties.map((p) => {
        const statusClass = p.status === 'rezervace' ? 'status-reserved' : p.status === 'prodáno' ? 'status-sold' : 'status-active';
        const location = [p.city, p.district].filter(Boolean).join(', ') || 'Neznámé';
        const typeLabel = p.type || '';
        const area = p.area_m2 ? `${p.area_m2} m²` : '';
        const rooms = p.rooms && p.rooms !== '-' ? p.rooms : '';
        return `
          <div class="property-row" data-id="${escapeHtml(p.id)}">
            <div class="property-row-main">
              <div class="property-title">${escapeHtml(p.title)}</div>
              <div class="property-meta">
                <span class="property-type-badge">${escapeHtml(typeLabel)}</span>
                <span class="property-location">${escapeHtml(location)}</span>
                ${area ? `<span class="property-area">${area}</span>` : ''}
                ${rooms ? `<span class="property-rooms">${escapeHtml(rooms)}</span>` : ''}
              </div>
            </div>
            <div class="property-row-price">
              <div class="property-price">${p.price ? this.formatPrice(p.price) : 'Na dotaz'}</div>
              ${p.price_per_m2 ? `<div class="property-price-m2">${this.formatPrice(p.price_per_m2)}/m²</div>` : ''}
              <span class="property-status ${statusClass}">${escapeHtml(p.status || 'aktivní')}</span>
            </div>
          </div>
        `;
      }).join('')
      : '<div class="property-empty">Žádné nabídky v této kategorii</div>';

    this.setContent(`
      ${tabs}
      <div class="property-feed-list">${rows}</div>
    `);

    // Attach tab handlers
    this.content.querySelectorAll('.panel-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeTab = (btn as HTMLElement).dataset.tab as TabId;
        void this.loadData();
      });
    });
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
