import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';

type Alert = {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  read: boolean;
  created_at: string;
};

const REFRESH_MS = 30 * 1000;

const DEMO_ALERTS: Alert[] = [
  {
    id: '1', type: 'price_drop', title: 'Snížení ceny: Byt 3+kk Vinohrady',
    description: 'Cena snížena o 500 000 Kč (z 9 450 000 na 8 950 000 Kč)',
    severity: 'high', created_at: '2026-03-22T10:30:00', read: false,
  },
  {
    id: '2', type: 'new_listing', title: 'Nová nabídka: Byt 2+kk Karlín',
    description: 'Nový byt v preferované lokalitě. 52m², 5 200 000 Kč.',
    severity: 'medium', created_at: '2026-03-22T09:15:00', read: false,
  },
  {
    id: '3', type: 'status_change', title: 'Změna stavu: Dům Černošice',
    description: 'Nemovitost přešla do stavu "rezervace". Klient: Novák.',
    severity: 'medium', created_at: '2026-03-22T08:45:00', read: true,
  },
  {
    id: '4', type: 'market_shift', title: 'Tržní signál: Praha 5',
    description: 'Průměrná cena/m² v Praze 5 vzrostla o 3.2% za poslední měsíc.',
    severity: 'low', created_at: '2026-03-21T16:00:00', read: true,
  },
];

export class AlertsPanel extends Panel {
  private alerts: Alert[] = [];
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({
      id: 'alerts-panel',
      title: 'Upozornění',
      showCount: true,
    });
    void this.loadAlerts();
    this.refreshTimer = setInterval(() => void this.loadAlerts(), REFRESH_MS);
  }

  private async loadAlerts(): Promise<void> {
    try {
      const res = await fetch('/api/alerts?unread=false&limit=30');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { alerts: Alert[]; source: string };
      this.alerts = data.alerts;
      if (this.alerts.length === 0 && data.source === 'demo') {
        this.alerts = DEMO_ALERTS;
      }
    } catch {
      this.alerts = DEMO_ALERTS;
    }
    this.setCount(this.alerts.filter((a) => !a.read).length);
    this.renderAlerts();
  }

  private renderAlerts(): void {
    const unread = this.alerts.filter((a) => !a.read);
    const read = this.alerts.filter((a) => a.read);

    const renderAlert = (a: Alert): string => {
      const severityClass = `alert-${a.severity}`;
      const typeIcons: Record<string, string> = {
        price_drop: '💰', new_listing: '🏠', status_change: '📋',
        market_shift: '📊', portal_update: '🔍',
      };
      const typeIcon = typeIcons[a.type] || '🔔';
      const timeStr = new Date(a.created_at).toLocaleString('cs-CZ', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      });
      return `
        <div class="alert-item ${severityClass} ${a.read ? 'alert-read' : 'alert-unread'}" data-id="${escapeHtml(a.id)}">
          <div class="alert-icon">${typeIcon}</div>
          <div class="alert-body">
            <div class="alert-title">${escapeHtml(a.title)}</div>
            <div class="alert-desc">${escapeHtml(a.description)}</div>
            <div class="alert-time">${timeStr}</div>
          </div>
        </div>
      `;
    };

    let html = '';
    if (unread.length > 0) {
      html += `<div class="alert-section-label">Nepřečtené (${unread.length})</div>`;
      html += unread.map(renderAlert).join('');
    }
    if (read.length > 0) {
      html += `<div class="alert-section-label">Přečtené</div>`;
      html += read.map(renderAlert).join('');
    }
    if (this.alerts.length === 0) {
      html = '<div class="alert-section-label">Žádná upozornění</div>';
    }

    this.setContent(`<div class="alerts-list">${html}</div>`);
  }

  destroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    super.destroy();
  }
}
