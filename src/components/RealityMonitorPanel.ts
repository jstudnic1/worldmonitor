import { Panel } from './Panel';
import { generateId, saveToStorage, loadFromStorage } from '@/utils';
import { escapeHtml } from '@/utils/sanitize';

type Property = {
  id: string;
  title: string;
  type: string;
  price: number;
  city: string;
  district: string;
  status: string;
};

type Watchdog = {
  id: string;
  keywords: string;
  city: string;
  type: string;
  maxPrice: number;
};

const STORAGE_KEY = 'reality-watchdogs';

export class RealityMonitorPanel extends Panel {
  private watchdogs: Watchdog[] = [];
  private properties: Property[] = [];
  private showForm = false;

  constructor() {
    super({
      id: 'monitors',
      title: 'Hlídací psi a Oblíbené',
      infoTooltip: 'Správa uložených hledání a automatické hlídání trhu',
      showCount: true,
    });

    this.watchdogs = loadFromStorage<Watchdog[]>(STORAGE_KEY, []);
    if (this.watchdogs.length === 0) {
      this.watchdogs.push({ id: generateId(), keywords: '3+kk', city: 'Praha', type: 'byt', maxPrice: 10000000 });
      this.watchdogs.push({ id: generateId(), keywords: '', city: 'Brno', type: 'byt', maxPrice: 6000000 });
    }

    this.properties = [
      { id: '1', title: 'Byt 3+kk, Vinohrady', type: 'byt', price: 8950000, city: 'Praha', district: 'Vinohrady', status: 'aktivní' },
      { id: '2', title: 'Byt 2+1, Smíchov', type: 'byt', price: 6200000, city: 'Praha', district: 'Smíchov', status: 'aktivní' },
      { id: '3', title: 'Rodinný dům, Černošice', type: 'dům', price: 12500000, city: 'Černošice', district: 'Praha-západ', status: 'rezervace' },
      { id: '4', title: 'Byt 1+kk, Karlín', type: 'byt', price: 4800000, city: 'Praha', district: 'Karlín', status: 'aktivní' },
      { id: '5', title: 'Byt 4+kk, Dejvice', type: 'byt', price: 15200000, city: 'Praha', district: 'Dejvice', status: 'aktivní' },
      { id: '6', title: 'Komerční prostor, Centrum', type: 'komerční', price: 22000000, city: 'Praha', district: 'Praha 1', status: 'aktivní' },
      { id: '7', title: 'Byt 2+kk, Brno-střed', type: 'byt', price: 4200000, city: 'Brno', district: 'Brno-střed', status: 'aktivní' },
      { id: '8', title: 'Pozemek, Říčany', type: 'pozemek', price: 3600000, city: 'Říčany', district: 'Praha-východ', status: 'aktivní' },
    ];

    this.content.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      if (target.closest('#toggle-wdg-form')) {
        this.showForm = !this.showForm;
        this.renderContent();
      } else if (target.closest('#save-wdg-btn')) {
        const city = ((this.content.querySelector('#new-wdg-city') as HTMLInputElement)?.value || '').trim();
        const keywords = ((this.content.querySelector('#new-wdg-kw') as HTMLInputElement)?.value || '').trim();
        const type = ((this.content.querySelector('#new-wdg-type') as HTMLSelectElement)?.value || '').trim();
        const maxPrice = parseInt(((this.content.querySelector('#new-wdg-maxprice') as HTMLInputElement)?.value || '0'), 10) || 0;
        this.addWatchdog({ city, keywords, type, maxPrice });
      } else if (target.closest('.wdg-del-btn')) {
        const id = (target.closest('.wdg-del-btn') as HTMLElement).dataset.id;
        if (id) this.removeWatchdog(id);
      }
    });

    this.renderContent();
  }

  private saveWatchdogs(): void {
    saveToStorage(STORAGE_KEY, this.watchdogs);
    this.setCount(this.watchdogs.length);
    this.renderContent();
  }

  private addWatchdog(watchdog: Omit<Watchdog, 'id'>): void {
    this.watchdogs.push({ id: generateId(), ...watchdog });
    this.showForm = false;
    this.saveWatchdogs();
  }

  private removeWatchdog(id: string): void {
    this.watchdogs = this.watchdogs.filter((watchdog) => watchdog.id !== id);
    this.saveWatchdogs();
  }

  public renderResults(_news?: any[]): void {
    // Stub required by data-loader.ts which calls this globally
    // RealityMonitorPanel handles its own state updates internally via saveWatchdogs.
  }

  private renderContent(): void {
    const formatPrice = (price: number) => (
      price >= 1000000
        ? `${(price / 1000000).toFixed(1).replace('.0', '')} mil. Kč`
        : `${price.toLocaleString('cs-CZ')} Kč`
    );

    const watchdogHtml = this.watchdogs.map((watchdog) => {
      const matches = this.properties.filter((property) => {
        if (
          watchdog.city
          && !property.city.toLowerCase().includes(watchdog.city.toLowerCase())
          && !property.district.toLowerCase().includes(watchdog.city.toLowerCase())
        ) return false;
        if (watchdog.type && property.type.toLowerCase() !== watchdog.type.toLowerCase()) return false;
        if (watchdog.maxPrice && property.price > watchdog.maxPrice) return false;
        if (watchdog.keywords && !property.title.toLowerCase().includes(watchdog.keywords.toLowerCase())) return false;
        return true;
      });

      const titles = matches.map((match) => `${match.title} (${formatPrice(match.price)})`).join(' • ');
      const description = [
        watchdog.city ? escapeHtml(watchdog.city) : '',
        watchdog.type ? escapeHtml(watchdog.type) : '',
        watchdog.keywords ? escapeHtml(watchdog.keywords) : '',
        watchdog.maxPrice ? `do ${formatPrice(watchdog.maxPrice)}` : '',
      ].filter(Boolean).join(' • ');

      return `
        <div style="background: rgba(255,255,255,0.03); border-radius: 6px; padding: 10px; margin-bottom: 8px; border-left: 3px solid ${matches.length > 0 ? '#3b82f6' : '#6b7280'}; position: relative;">
          <button class="wdg-del-btn" data-id="${watchdog.id}" style="position: absolute; right: 8px; top: 8px; background: transparent; border: none; color: #888; cursor: pointer; font-size: 16px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 4px;">&times;</button>
          <div style="padding-right: 28px;">
            <div style="font-weight: 600; color: #fff; margin-bottom: 4px;">${description || 'Všechny nemovitosti'}</div>
            ${matches.length > 0
              ? `<div style="color: #60a5fa; font-size: 11px; line-height: 1.4;">Nalezeno ${matches.length}:<br> ${escapeHtml(titles)}</div>`
              : `<div style="color: #888; font-size: 11px;">Žádné nové shody</div>`}
          </div>
        </div>
      `;
    }).join('');

    const html = `
      <div style="padding: 12px; font-family: Inter, Roboto, sans-serif; font-size: 13px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
          <h4 style="margin: 0; font-weight: 600; color: #fff;">Hlídací psi</h4>
          <button id="toggle-wdg-form" style="background: rgba(59,130,246,0.2); border: 1px solid rgba(59,130,246,0.4); color: #60a5fa; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 11px;">
            ${this.showForm ? 'Zavřít' : '+ Přidat'}
          </button>
        </div>

        ${this.showForm ? `
          <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.05);">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
              <input id="new-wdg-city" placeholder="Lokalita (Praha)" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 6px; border-radius: 4px; font-size: 12px; min-width: 0;" />
              <input id="new-wdg-kw" placeholder="Slova (3+kk)" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 6px; border-radius: 4px; font-size: 12px; min-width: 0;" />
              <select id="new-wdg-type" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 6px; border-radius: 4px; font-size: 12px; min-width: 0;">
                <option value="">Typ (Vše)</option>
                <option value="byt">Byt</option>
                <option value="dům">Dům</option>
                <option value="pozemek">Pozemek</option>
              </select>
              <input id="new-wdg-maxprice" type="number" placeholder="Max cena (Kč)" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 6px; border-radius: 4px; font-size: 12px; min-width: 0;" />
            </div>
            <button id="save-wdg-btn" style="width: 100%; padding: 6px; background: #3b82f6; color: #fff; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; font-size: 12px;">Uložit hlídače</button>
          </div>
        ` : ''}

        ${watchdogHtml || '<div style="color: #888; font-size: 11px; margin-bottom: 16px;">Zatím nemáte žádné hlídací psy.</div>'}

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; margin-top: 24px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
          <h4 style="margin: 0; font-weight: 600; color: #fff;">Sledované (Oblíbené)</h4>
        </div>
        <div style="background: rgba(255,255,255,0.03); border-radius: 6px; padding: 10px; margin-bottom: 8px; display: flex; gap: 10px; position: relative;">
          <div style="width: 4px; border-radius: 2px; background: #10b981;"></div>
          <div style="flex: 1;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <div style="font-weight: 600; color: #fff;">Byt 2+kk, 54 m²</div>
              <div style="font-weight: 600; color: #10b981;">6 490 000 Kč</div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 11px; align-items: center;">
              <span style="color: #888;">Praha Holešovice • Sreality</span>
              <span style="color: #10b981; background: rgba(16,185,129,0.15); padding: 2px 6px; border-radius: 4px; font-weight: 600;">↓ Sleva 300 tis.</span>
            </div>
          </div>
        </div>
      </div>
    `;

    this.setContent(html);
  }
}
