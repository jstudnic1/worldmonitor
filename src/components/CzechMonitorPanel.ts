import { Panel } from './Panel';
import type { MapView } from './MapContainer';
import type { Feed, NewsItem } from '@/types';
import {
  MarketServiceClient,
  type GetCountryStockIndexResponse,
  type MarketQuote,
} from '@/generated/client/worldmonitor/market/v1/service_client';
import { fetchFeed } from '@/services/rss';
import { t } from '@/services/i18n';
import { formatTime, getChangeClass, formatChange, rssProxyUrl } from '@/utils';
import { miniSparkline } from '@/utils/sparkline';
import { escapeHtml, sanitizeUrl } from '@/utils/sanitize';

type TabId = 'overview' | 'news' | 'markets' | 'watch' | 'live';

type CzechQuoteConfig = {
  symbol: string;
  label: string;
  detailKey: string;
  decimals?: number;
};

type Watchpoint = {
  id: string;
  titleKey: string;
  descriptionKey: string;
  tagKey: string;
  lat: number;
  lon: number;
  zoom: number;
};

type LiveResource = {
  id: string;
  title: string;
  descriptionKey: string;
  tagKey: string;
  href: string;
};

const REFRESH_MS = 5 * 60 * 1000;
const CZECHIA_CENTER = { lat: 49.8175, lon: 15.4730, zoom: 6.4 };

const client = new MarketServiceClient('', { fetch: (...args: Parameters<typeof fetch>) => globalThis.fetch(...args) });

const CZECH_NEWS_FEEDS: Feed[] = [
  {
    name: 'CT24',
    url: rssProxyUrl('https://news.google.com/rss/search?q=site:ct24.ceskatelevize.cz+when:2d&hl=cs&gl=CZ&ceid=CZ:cs'),
    lang: 'cs',
  },
  {
    name: 'Seznam Zpravy',
    url: rssProxyUrl('https://news.google.com/rss/search?q=site:seznamzpravy.cz+when:2d&hl=cs&gl=CZ&ceid=CZ:cs'),
    lang: 'cs',
  },
  {
    name: 'iROZHLAS',
    url: rssProxyUrl('https://news.google.com/rss/search?q=site:irozhlas.cz+when:2d&hl=cs&gl=CZ&ceid=CZ:cs'),
    lang: 'cs',
  },
  {
    name: 'Denik N',
    url: rssProxyUrl('https://news.google.com/rss/search?q=site:denikn.cz+when:2d&hl=cs&gl=CZ&ceid=CZ:cs'),
    lang: 'cs',
  },
  {
    name: 'Aktualne.cz',
    url: rssProxyUrl('https://news.google.com/rss/search?q=site:aktualne.cz+when:2d&hl=cs&gl=CZ&ceid=CZ:cs'),
    lang: 'cs',
  },
  {
    name: 'Novinky.cz',
    url: rssProxyUrl('https://news.google.com/rss/search?q=site:novinky.cz+when:2d&hl=cs&gl=CZ&ceid=CZ:cs'),
    lang: 'cs',
  },
  {
    name: 'iDNES.cz',
    url: rssProxyUrl('https://news.google.com/rss/search?q=site:idnes.cz+when:2d&hl=cs&gl=CZ&ceid=CZ:cs'),
    lang: 'cs',
  },
  {
    name: 'HN',
    url: rssProxyUrl('https://news.google.com/rss/search?q=site:hn.cz+when:2d&hl=cs&gl=CZ&ceid=CZ:cs'),
    lang: 'cs',
  },
];

const CZECH_QUOTES: CzechQuoteConfig[] = [
  { symbol: 'EURCZK=X', label: 'EUR/CZK', detailKey: 'components.czechMonitor.quoteDetails.eur' },
  { symbol: 'USDCZK=X', label: 'USD/CZK', detailKey: 'components.czechMonitor.quoteDetails.usd' },
  { symbol: 'CEZ.PR', label: 'CEZ', detailKey: 'components.czechMonitor.quoteDetails.cez', decimals: 2 },
  { symbol: 'KOMB.PR', label: 'KB', detailKey: 'components.czechMonitor.quoteDetails.kb', decimals: 2 },
  { symbol: 'MONET.PR', label: 'Moneta', detailKey: 'components.czechMonitor.quoteDetails.moneta', decimals: 2 },
];

const WATCHPOINTS: Watchpoint[] = [
  {
    id: 'prague',
    titleKey: 'components.czechMonitor.watchpoints.prague.title',
    descriptionKey: 'components.czechMonitor.watchpoints.prague.description',
    tagKey: 'components.czechMonitor.watchpoints.prague.tag',
    lat: 50.0755,
    lon: 14.4378,
    zoom: 8.4,
  },
  {
    id: 'brno',
    titleKey: 'components.czechMonitor.watchpoints.brno.title',
    descriptionKey: 'components.czechMonitor.watchpoints.brno.description',
    tagKey: 'components.czechMonitor.watchpoints.brno.tag',
    lat: 49.1951,
    lon: 16.6068,
    zoom: 8.6,
  },
  {
    id: 'temelin',
    titleKey: 'components.czechMonitor.watchpoints.temelin.title',
    descriptionKey: 'components.czechMonitor.watchpoints.temelin.description',
    tagKey: 'components.czechMonitor.watchpoints.temelin.tag',
    lat: 49.1797,
    lon: 14.3766,
    zoom: 9.1,
  },
  {
    id: 'dukovany',
    titleKey: 'components.czechMonitor.watchpoints.dukovany.title',
    descriptionKey: 'components.czechMonitor.watchpoints.dukovany.description',
    tagKey: 'components.czechMonitor.watchpoints.dukovany.tag',
    lat: 49.085,
    lon: 16.1483,
    zoom: 9.1,
  },
  {
    id: 'ostrava',
    titleKey: 'components.czechMonitor.watchpoints.ostrava.title',
    descriptionKey: 'components.czechMonitor.watchpoints.ostrava.description',
    tagKey: 'components.czechMonitor.watchpoints.ostrava.tag',
    lat: 49.8209,
    lon: 18.2625,
    zoom: 8.8,
  },
  {
    id: 'vaclav-havel',
    titleKey: 'components.czechMonitor.watchpoints.airport.title',
    descriptionKey: 'components.czechMonitor.watchpoints.airport.description',
    tagKey: 'components.czechMonitor.watchpoints.airport.tag',
    lat: 50.1008,
    lon: 14.26,
    zoom: 9,
  },
];

const CZECH_LIVE_BROADCASTS: LiveResource[] = [
  {
    id: 'ct24',
    title: 'CT24',
    descriptionKey: 'components.czechMonitor.live.broadcasts.ct24',
    tagKey: 'components.czechMonitor.live.tags.tv',
    href: 'https://www.ceskatelevize.cz/ivysilani/zive/',
  },
  {
    id: 'cnn-prima',
    title: 'CNN Prima NEWS',
    descriptionKey: 'components.czechMonitor.live.broadcasts.cnnPrima',
    tagKey: 'components.czechMonitor.live.tags.tv',
    href: 'https://cnn.iprima.cz/vysilani',
  },
  {
    id: 'radiozurnal',
    title: 'Radiozurnal',
    descriptionKey: 'components.czechMonitor.live.broadcasts.radiozurnal',
    tagKey: 'components.czechMonitor.live.tags.radio',
    href: 'https://www.mujrozhlas.cz/zive/radiozurnal',
  },
];

const CZECH_LIVE_CAMERAS: LiveResource[] = [
  {
    id: 'airport',
    title: 'Vaclav Havel Airport',
    descriptionKey: 'components.czechMonitor.live.cameras.airport',
    tagKey: 'components.czechMonitor.live.tags.camera',
    href: 'https://www.prg.aero/en/live',
  },
  {
    id: 'main-station',
    title: 'Prague Main Station',
    descriptionKey: 'components.czechMonitor.live.cameras.mainStation',
    tagKey: 'components.czechMonitor.live.tags.transport',
    href: 'https://www.camguide.net/webcam/cesko/hlavni-nadrazi-praha',
  },
  {
    id: 'old-town',
    title: 'Prague Old Town',
    descriptionKey: 'components.czechMonitor.live.cameras.oldTown',
    tagKey: 'components.czechMonitor.live.tags.camera',
    href: 'https://www.skylinewebcams.com/en/webcam/czech-republic/prague/prague/prague.html',
  },
  {
    id: 'panorama',
    title: 'Prague Panorama',
    descriptionKey: 'components.czechMonitor.live.cameras.panorama',
    tagKey: 'components.czechMonitor.live.tags.city',
    href: 'https://www.skylinewebcams.com/en/webcam/czech-republic/prague/prague/panorama.html',
  },
];

export class CzechMonitorPanel extends Panel {
  private activeTab: TabId = 'overview';
  private headlines: NewsItem[] = [];
  private marketQuotes: MarketQuote[] = [];
  private indexData: GetCountryStockIndexResponse | null = null;
  private refreshTimer: number | null = null;
  private isRefreshing = false;
  private lastUpdatedAt: Date | null = null;
  private onMapFocus?: (lat: number, lon: number, zoom: number) => void;
  private onOpenCountryBrief?: (code: string) => void;
  private onSetView?: (view: MapView) => void;

  constructor() {
    super({
      id: 'czech-monitor',
      title: t('panels.czechMonitor'),
      className: 'panel-wide',
      showCount: true,
      trackActivity: true,
    });

    this.content.addEventListener('click', (event) => this.handleContentClick(event));
    this.showLoading(t('components.czechMonitor.loading'));
    void this.refresh();
    this.refreshTimer = window.setInterval(() => {
      void this.refresh(false);
    }, REFRESH_MS);
  }

  public setMapFocusHandler(handler: (lat: number, lon: number, zoom: number) => void): void {
    this.onMapFocus = handler;
  }

  public setCountryBriefHandler(handler: (code: string) => void): void {
    this.onOpenCountryBrief = handler;
  }

  public setViewHandler(handler: (view: MapView) => void): void {
    this.onSetView = handler;
  }

  public async refresh(showBusy = true): Promise<void> {
    if (this.isRefreshing) return;
    this.isRefreshing = true;
    if (showBusy && !this.headlines.length && !this.marketQuotes.length) {
      this.showLoading(t('components.czechMonitor.loading'));
    }

    try {
      const [newsItems, quoteResponse, indexResponse] = await Promise.all([
        this.fetchNews(),
        client.listMarketQuotes({ symbols: CZECH_QUOTES.map((quote) => quote.symbol) }, { signal: this.signal }),
        client.getCountryStockIndex({ countryCode: 'CZ' }, { signal: this.signal }),
      ]);

      if (this.signal.aborted) return;

      this.headlines = newsItems;
      this.marketQuotes = quoteResponse.quotes ?? [];
      this.indexData = indexResponse?.available ? indexResponse : null;
      this.lastUpdatedAt = new Date();
      this.setCount(this.headlines.length);
      this.render();
    } catch (error) {
      if (this.isAbortError(error)) return;
      console.error('[CzechMonitorPanel] refresh failed', error);
      if (!this.headlines.length && !this.marketQuotes.length && !this.indexData) {
        this.showError(t('components.czechMonitor.loadFailed'), () => {
          void this.refresh();
        });
        return;
      }
      this.render();
    } finally {
      this.isRefreshing = false;
    }
  }

  public override destroy(): void {
    if (this.refreshTimer !== null) {
      window.clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    super.destroy();
  }

  private async fetchNews(): Promise<NewsItem[]> {
    const settled = await Promise.allSettled(CZECH_NEWS_FEEDS.map((feed) => fetchFeed(feed)));
    const merged = settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
    return this.dedupeNews(merged)
      .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
      .slice(0, 14);
  }

  private dedupeNews(items: NewsItem[]): NewsItem[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = `${item.link || ''}::${item.title.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private handleContentClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const tab = target.closest<HTMLElement>('.panel-tab');
    if (tab?.dataset.tab) {
      const nextTab = tab.dataset.tab as TabId;
      if (nextTab !== this.activeTab) {
        this.activeTab = nextTab;
        this.render();
      }
      return;
    }

    const action = target.closest<HTMLElement>('[data-action]');
    if (!action) return;

    const actionId = action.dataset.action;
    if (actionId === 'focus-country') {
      this.onMapFocus?.(CZECHIA_CENTER.lat, CZECHIA_CENTER.lon, CZECHIA_CENTER.zoom);
      return;
    }

    if (actionId === 'open-brief') {
      this.onOpenCountryBrief?.('CZ');
      return;
    }

    if (actionId === 'focus-watch') {
      const lat = Number(action.dataset.lat);
      const lon = Number(action.dataset.lon);
      const zoom = Number(action.dataset.zoom || '8');
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        this.onMapFocus?.(lat, lon, zoom);
      }
      return;
    }

    if (actionId === 'open-panel') {
      const nextView = action.dataset.view as MapView | undefined;
      if (nextView) this.onSetView?.(nextView);
      const panelId = action.dataset.panel;
      if (!panelId) return;
      document.querySelector<HTMLElement>(`[data-panel="${panelId}"]`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }

  private render(): void {
    const tabsHtml = `
      <div class="panel-tabs">
        <button class="panel-tab ${this.activeTab === 'overview' ? 'active' : ''}" data-tab="overview">${t('components.czechMonitor.tabs.overview')}</button>
        <button class="panel-tab ${this.activeTab === 'news' ? 'active' : ''}" data-tab="news">${t('components.czechMonitor.tabs.news')}</button>
        <button class="panel-tab ${this.activeTab === 'markets' ? 'active' : ''}" data-tab="markets">${t('components.czechMonitor.tabs.markets')}</button>
        <button class="panel-tab ${this.activeTab === 'watch' ? 'active' : ''}" data-tab="watch">${t('components.czechMonitor.tabs.watch')}</button>
        <button class="panel-tab ${this.activeTab === 'live' ? 'active' : ''}" data-tab="live">${t('components.czechMonitor.tabs.live')}</button>
      </div>
    `;

    let body = '';
    switch (this.activeTab) {
      case 'overview':
        body = this.renderOverview();
        break;
      case 'news':
        body = this.renderNews();
        break;
      case 'markets':
        body = this.renderMarkets();
        break;
      case 'watch':
        body = this.renderWatchpoints();
        break;
      case 'live':
        body = this.renderLive();
        break;
    }

    const updatedLabel = this.lastUpdatedAt
      ? t('components.czechMonitor.updated', { time: formatTime(this.lastUpdatedAt) })
      : t('components.czechMonitor.waiting');

    this.setContent(`
      ${tabsHtml}
      <div class="cz-monitor-panel">
        ${body}
        <div class="cz-monitor-footer">
          <span>${escapeHtml(updatedLabel)}</span>
          <span>${escapeHtml(t('components.czechMonitor.sourceSummary', { count: String(CZECH_NEWS_FEEDS.length) }))}</span>
        </div>
      </div>
    `);
  }

  private renderOverview(): string {
    const eurQuote = this.findQuote('EURCZK=X');
    const usdQuote = this.findQuote('USDCZK=X');
    const latestHeadlines = this.headlines.slice(0, 4);

    return `
      <div class="cz-monitor-grid">
        <div class="cz-stat-card">
          <span class="cz-stat-label">${t('components.czechMonitor.cards.time')}</span>
          <span class="cz-stat-value">${escapeHtml(this.formatPragueTime())}</span>
          <span class="cz-stat-subtle">${t('components.czechMonitor.cards.timeDetail')}</span>
        </div>
        <div class="cz-stat-card">
          <span class="cz-stat-label">${t('components.czechMonitor.cards.headlines')}</span>
          <span class="cz-stat-value">${this.headlines.length}</span>
          <span class="cz-stat-subtle">${escapeHtml(t('components.czechMonitor.cards.headlinesDetail'))}</span>
        </div>
        <div class="cz-stat-card">
          <span class="cz-stat-label">${t('components.czechMonitor.cards.index')}</span>
          <span class="cz-stat-value">${escapeHtml(this.indexData ? this.formatCompactNumber(this.indexData.price, 2) : '—')}</span>
          <span class="cz-stat-subtle ${this.indexData ? getChangeClass(this.indexData.weekChangePercent) : ''}">
            ${escapeHtml(this.indexData ? `${formatChange(this.indexData.weekChangePercent)} · ${this.indexData.currency}` : t('components.czechMonitor.noMarketData'))}
          </span>
        </div>
        <div class="cz-stat-card">
          <span class="cz-stat-label">${t('components.czechMonitor.cards.fx')}</span>
          <span class="cz-stat-value">${escapeHtml(eurQuote ? this.formatCompactNumber(eurQuote.price, 3) : '—')}</span>
          <span class="cz-stat-subtle">
            ${escapeHtml(usdQuote ? `USD ${this.formatCompactNumber(usdQuote.price, 3)}` : t('components.czechMonitor.noMarketData'))}
          </span>
        </div>
      </div>

      <div class="cz-monitor-actions">
        <button class="cz-action-btn" data-action="focus-country">${t('components.czechMonitor.focusMap')}</button>
        <button class="cz-action-btn cz-action-btn-secondary" data-action="open-brief">${t('components.czechMonitor.openBrief')}</button>
      </div>

      <div class="cz-section">
        <div class="cz-section-title">${t('components.czechMonitor.latestHeadlines')}</div>
        ${latestHeadlines.length ? `
          <div class="cz-news-list">
            ${latestHeadlines.map((item) => this.renderNewsRow(item)).join('')}
          </div>
        ` : `<div class="panel-empty">${t('components.czechMonitor.noNews')}</div>`}
      </div>
    `;
  }

  private renderNews(): string {
    if (!this.headlines.length) {
      return `<div class="panel-empty">${t('components.czechMonitor.noNews')}</div>`;
    }

    return `
      <div class="cz-section">
        <div class="cz-section-title">${t('components.czechMonitor.newsSectionTitle')}</div>
        <div class="cz-news-list">
          ${this.headlines.map((item) => this.renderNewsRow(item)).join('')}
        </div>
      </div>
    `;
  }

  private renderMarkets(): string {
    const quoteRows = CZECH_QUOTES
      .map((config) => ({ config, quote: this.findQuote(config.symbol) }))
      .filter((entry) => entry.quote);

    if (!this.indexData && !quoteRows.length) {
      return `<div class="panel-empty">${t('components.czechMonitor.noMarketData')}</div>`;
    }

    return `
      <div class="cz-market-grid">
        ${this.indexData ? `
          <div class="cz-market-card cz-market-card--hero">
            <div class="cz-market-header">
              <span class="cz-market-label">${escapeHtml(this.indexData.indexName)}</span>
              <span class="cz-market-symbol">${escapeHtml(this.indexData.symbol)}</span>
            </div>
            <div class="cz-market-price">${escapeHtml(this.formatCompactNumber(this.indexData.price, 2))}</div>
            <div class="cz-market-change ${getChangeClass(this.indexData.weekChangePercent)}">${escapeHtml(formatChange(this.indexData.weekChangePercent))}</div>
            <div class="cz-market-note">${escapeHtml(t('components.czechMonitor.indexDetail', { currency: this.indexData.currency }))}</div>
          </div>
        ` : ''}
        ${quoteRows.map(({ config, quote }) => `
          <div class="cz-market-card">
            <div class="cz-market-header">
              <span class="cz-market-label">${escapeHtml(config.label)}</span>
              <span class="cz-market-symbol">${escapeHtml(quote!.symbol)}</span>
            </div>
            <div class="cz-market-price">${escapeHtml(this.formatCompactNumber(quote!.price, config.decimals ?? 3))}</div>
            <div class="cz-market-change ${getChangeClass(quote!.change)}">${escapeHtml(formatChange(quote!.change))}</div>
            ${quote!.sparkline?.length ? `<div class="cz-market-spark">${miniSparkline(quote!.sparkline, quote!.change, 96, 18)}</div>` : ''}
            <div class="cz-market-note">${escapeHtml(t(config.detailKey))}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  private renderWatchpoints(): string {
    return `
      <div class="cz-section">
        <div class="cz-section-title">${t('components.czechMonitor.watchSectionTitle')}</div>
        <div class="cz-watch-grid">
          ${WATCHPOINTS.map((point) => `
            <div class="cz-watch-card">
              <div class="cz-watch-card-top">
                <div>
                  <div class="cz-watch-title">${escapeHtml(t(point.titleKey))}</div>
                  <div class="cz-watch-desc">${escapeHtml(t(point.descriptionKey))}</div>
                </div>
                <span class="cz-chip">${escapeHtml(t(point.tagKey))}</span>
              </div>
              <button
                class="cz-action-btn cz-action-btn-secondary"
                data-action="focus-watch"
                data-lat="${point.lat}"
                data-lon="${point.lon}"
                data-zoom="${point.zoom}"
              >${t('components.czechMonitor.focusPoint')}</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  private renderLive(): string {
    return `
      <div class="cz-monitor-actions">
        <button class="cz-action-btn" data-action="open-panel" data-panel="live-news" data-view="czechia">${t('components.czechMonitor.live.openBroadcastPanel')}</button>
        <button class="cz-action-btn cz-action-btn-secondary" data-action="open-panel" data-panel="live-webcams" data-view="czechia">${t('components.czechMonitor.live.openWebcamsPanel')}</button>
      </div>

      <div class="cz-section">
        <div class="cz-section-title">${t('components.czechMonitor.live.broadcastSection')}</div>
        <div class="cz-watch-grid">
          ${CZECH_LIVE_BROADCASTS.map((resource) => this.renderLiveCard(resource, t('components.czechMonitor.live.watchLive'))).join('')}
        </div>
      </div>

      <div class="cz-section">
        <div class="cz-section-title">${t('components.czechMonitor.live.cameraSection')}</div>
        <div class="cz-watch-grid">
          ${CZECH_LIVE_CAMERAS.map((resource) => this.renderLiveCard(resource, t('components.czechMonitor.live.openCamera'))).join('')}
        </div>
      </div>
    `;
  }

  private renderNewsRow(item: NewsItem): string {
    return `
      <a class="cz-news-item" href="${sanitizeUrl(item.link)}" target="_blank" rel="noopener">
        <div class="cz-news-meta">
          <span class="cz-news-source">${escapeHtml(item.source)}</span>
          <span class="cz-news-time">${escapeHtml(formatTime(item.pubDate))}</span>
        </div>
        <div class="cz-news-title">${escapeHtml(item.title)}</div>
      </a>
    `;
  }

  private renderLiveCard(resource: LiveResource, actionLabel: string): string {
    return `
      <div class="cz-watch-card">
        <div class="cz-watch-card-top">
          <div>
            <div class="cz-watch-title">${escapeHtml(resource.title)}</div>
            <div class="cz-watch-desc">${escapeHtml(t(resource.descriptionKey))}</div>
          </div>
          <span class="cz-chip">${escapeHtml(t(resource.tagKey))}</span>
        </div>
        <div class="cz-link-row">
          <a class="cz-action-link" href="${sanitizeUrl(resource.href)}" target="_blank" rel="noopener">${escapeHtml(actionLabel)}</a>
        </div>
      </div>
    `;
  }

  private findQuote(symbol: string): MarketQuote | undefined {
    return this.marketQuotes.find((quote) => quote.symbol === symbol);
  }

  private formatPragueTime(): string {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Prague',
    }).format(new Date());
  }

  private formatCompactNumber(value: number, decimals = 2): string {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: value >= 1000 ? 0 : Math.min(decimals, 2),
      maximumFractionDigits: value >= 1000 ? 0 : decimals,
    }).format(value);
  }
}
