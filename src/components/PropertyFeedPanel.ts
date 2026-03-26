import { Panel } from './Panel';
import { SITE_VARIANT } from '@/config';
import {
  getFocusedRealityProperty,
  setFocusedRealityProperty,
  subscribeRealityPropertyFocusChange,
} from '@/services/reality-property-focus';
import {
  getRealityPropertySource,
  subscribeRealityPropertySourceChange,
} from '@/services/reality-source-settings';
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
  lat?: number;
  lon?: number;
  source?: string;
  image_url?: string;
};

type TabId = 'sale' | 'rent' | 'new';
type PropertiesResponse = {
  properties: Property[];
  source?: string;
};

const REFRESH_MS = 60 * 1000;

export class PropertyFeedPanel extends Panel {
  private activeTab: TabId = 'sale';
  private properties: Property[] = [];
  private selectedPropertyId: string | null = getFocusedRealityProperty()?.id ?? null;
  private loadError: string | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribeSourceChange: (() => void) | null = null;
  private unsubscribePropertyFocusChange: (() => void) | null = null;

  constructor() {
    super({
      id: 'property-feed',
      title: 'Nabídky nemovitostí',
      showCount: true,
      className: 'panel-wide',
    });
    this.content.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const tab = target.closest<HTMLElement>('.panel-tab');
      if (tab?.dataset.tab) {
        this.activeTab = tab.dataset.tab as TabId;
        void this.loadData();
        return;
      }

      const row = target.closest<HTMLElement>('.property-row');
      if (row?.dataset.id) {
        this.selectProperty(row.dataset.id);
      }
    });
    this.content.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = event.target as HTMLElement;
      const row = target.closest<HTMLElement>('.property-row');
      if (!row?.dataset.id) return;
      event.preventDefault();
      this.selectProperty(row.dataset.id);
    });
    void this.loadData();
    this.refreshTimer = setInterval(() => void this.loadData(), REFRESH_MS);
    this.unsubscribeSourceChange = subscribeRealityPropertySourceChange(() => {
      void this.loadData();
    });
    this.unsubscribePropertyFocusChange = subscribeRealityPropertyFocusChange((focus) => {
      this.selectedPropertyId = focus?.id ?? null;
      this.applySelectedState();
    });
  }

  private async loadData(): Promise<void> {
    try {
      const params = new URLSearchParams({ type: this.activeTab });
      const source = getRealityPropertySource();
      if (source !== 'all') params.set('source', source);

      const res = await fetch(`/api/properties?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as PropertiesResponse;
      if (SITE_VARIANT === 'reality' && data.source !== 'supabase') {
        this.properties = [];
        this.loadError = 'Živá data nemovitostí nejsou aktuálně dostupná.';
        this.setCount(0);
        this.renderContent();
        return;
      }

      this.properties = SITE_VARIANT === 'reality'
        ? data.properties.filter((property) => Number.isFinite(property.lat) && Number.isFinite(property.lon))
        : data.properties;
      this.loadError = null;
      this.setCount(this.properties.length);
      this.renderContent();
    } catch {
      if (SITE_VARIANT === 'reality') {
        this.properties = [];
        this.loadError = 'Nepodařilo se načíst živé nabídky z databáze.';
        this.setCount(0);
        this.renderContent();
        return;
      }
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
        const isSelected = this.selectedPropertyId === p.id;
        return `
          <div class="property-row ${isSelected ? 'is-selected' : ''}" data-id="${escapeHtml(p.id)}" role="button" tabindex="0">
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
      : `<div class="property-empty">${escapeHtml(this.loadError || 'Žádné nabídky v této kategorii')}</div>`;

    this.setContent(`
      ${tabs}
      <div class="property-feed-list">${rows}</div>
    `);
  }

  private formatPrice(price: number): string {
    if (price >= 1000000) {
      return (price / 1000000).toFixed(1).replace('.0', '') + ' mil. Kč';
    }
    return price.toLocaleString('cs-CZ') + ' Kč';
  }

  private applySelectedState(): void {
    this.content.querySelectorAll<HTMLElement>('.property-row').forEach((row) => {
      row.classList.toggle('is-selected', row.dataset.id === this.selectedPropertyId);
    });
  }

  private selectProperty(propertyId: string): void {
    const property = this.properties.find((entry) => entry.id === propertyId);
    if (!property) return;
    this.selectedPropertyId = property.id;
    this.applySelectedState();
    setFocusedRealityProperty({
      id: property.id,
      title: property.title,
      lat: property.lat,
      lon: property.lon,
    });
  }

  destroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.unsubscribeSourceChange?.();
    this.unsubscribeSourceChange = null;
    this.unsubscribePropertyFocusChange?.();
    this.unsubscribePropertyFocusChange = null;
    super.destroy();
  }
}
