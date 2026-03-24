import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';

type CalendarEvent = {
  id: string;
  title: string;
  type: string;
  date: string;
  time: string;
  location?: string;
  notes?: string;
};

const REFRESH_MS = 120 * 1000;

const DEMO_EVENTS: CalendarEvent[] = [
  { id: '1', title: 'Prohlídka: Byt 3+kk Vinohrady', type: 'viewing', date: '2026-03-22', time: '14:00', location: 'Vinohradská 42, Praha 2' },
  { id: '2', title: 'Schůzka: Nový klient Dvořáková', type: 'meeting', date: '2026-03-22', time: '16:30', location: 'Kancelář' },
  { id: '3', title: 'Prohlídka: Dům Černošice', type: 'viewing', date: '2026-03-23', time: '10:00', location: 'Karlštejnská 15, Černošice' },
  { id: '4', title: 'Deadline: Nabídka pro Komerční banku', type: 'deadline', date: '2026-03-24', time: '17:00', notes: 'Smlouva musí být hotova.' },
  { id: '5', title: 'Týdenní report', type: 'report', date: '2026-03-25', time: '09:00' },
];

export class CalendarPanel extends Panel {
  private events: CalendarEvent[] = [];
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({
      id: 'calendar-panel',
      title: 'Kalendář',
      showCount: true,
    });
    void this.loadEvents();
    this.refreshTimer = setInterval(() => void this.loadEvents(), REFRESH_MS);
  }

  private async loadEvents(): Promise<void> {
    try {
      const res = await fetch('/api/calendar?days=14');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { events: CalendarEvent[]; source: string };
      this.events = data.events;
      if (this.events.length === 0 && data.source === 'demo') {
        this.events = DEMO_EVENTS;
      }
    } catch {
      this.events = DEMO_EVENTS;
    }
    this.setCount(this.events.length);
    this.renderCalendar();
  }

  private renderCalendar(): void {
    const today = new Date().toISOString().split('T')[0];
    const grouped = new Map<string, CalendarEvent[]>();

    for (const event of this.events) {
      const group = grouped.get(event.date) ?? [];
      grouped.set(event.date, [...group, event]);
    }

    let html = '';
    const sortedDates = [...grouped.keys()].sort();

    for (const date of sortedDates) {
      const events = grouped.get(date) ?? [];
      const d = new Date(date + 'T00:00:00');
      const isToday = date === today;
      const dayLabel = isToday ? 'Dnes' : d.toLocaleDateString('cs-CZ', {
        weekday: 'long', day: 'numeric', month: 'long',
      });

      html += `<div class="calendar-day ${isToday ? 'calendar-today' : ''}">
        <div class="calendar-day-header">${escapeHtml(dayLabel)}</div>`;

      for (const ev of events) {
        const typeIcons: Record<string, string> = {
          viewing: '🔑', meeting: '🤝', deadline: '⏰', report: '📄',
        };
        const typeIcon = typeIcons[ev.type] || '📅';
        const typeClass = `cal-${ev.type}`;

        html += `
          <div class="calendar-event ${typeClass}">
            <div class="cal-time">${escapeHtml(ev.time)}</div>
            <div class="cal-icon">${typeIcon}</div>
            <div class="cal-details">
              <div class="cal-title">${escapeHtml(ev.title)}</div>
              ${ev.location ? `<div class="cal-location">${escapeHtml(ev.location)}</div>` : ''}
              ${ev.notes ? `<div class="cal-notes">${escapeHtml(ev.notes)}</div>` : ''}
            </div>
          </div>
        `;
      }
      html += '</div>';
    }

    if (this.events.length === 0) {
      html = '<div class="calendar-day"><div class="calendar-day-header">Žádné nadcházející události</div></div>';
    }

    this.setContent(`<div class="calendar-list">${html}</div>`);
  }

  destroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    super.destroy();
  }
}
