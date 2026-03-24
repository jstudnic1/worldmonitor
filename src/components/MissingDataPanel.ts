import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';

type MissingField = {
  propertyId: string;
  propertyTitle: string;
  field: string;
  fieldLabel: string;
  severity: 'critical' | 'warning' | 'info';
};

type MissingDataResponse = {
  missing: MissingField[];
  total: number;
  propertiesScanned?: number;
  source: string;
};

const REFRESH_MS = 120 * 1000;

const DEMO_MISSING: MissingField[] = [
  { propertyId: '3', propertyTitle: 'Rodinný dům, Černošice', field: 'energy_rating', fieldLabel: 'Energetický štítek', severity: 'critical' },
  { propertyId: '3', propertyTitle: 'Rodinný dům, Černošice', field: 'floor_plan', fieldLabel: 'Půdorys', severity: 'warning' },
  { propertyId: '6', propertyTitle: 'Komerční prostor, Centrum', field: 'photos', fieldLabel: 'Fotografie', severity: 'critical' },
  { propertyId: '6', propertyTitle: 'Komerční prostor, Centrum', field: 'description', fieldLabel: 'Popis', severity: 'warning' },
  { propertyId: '8', propertyTitle: 'Pozemek, Říčany', field: 'energy_rating', fieldLabel: 'Energetický štítek', severity: 'critical' },
];

export class MissingDataPanel extends Panel {
  private missingFields: MissingField[] = [];
  private propertiesScanned = 0;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({
      id: 'missing-data',
      title: 'Chybějící data',
      showCount: true,
      infoTooltip: 'Přehled nemovitostí s neúplnými informacemi. Kritické = chybí cena nebo plocha. Varování = chybí fotky nebo popis.',
    });
    void this.loadData();
    this.refreshTimer = setInterval(() => void this.loadData(), REFRESH_MS);
  }

  private async loadData(): Promise<void> {
    try {
      const res = await fetch('/api/missing-data');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as MissingDataResponse;
      this.missingFields = data.missing;
      this.propertiesScanned = data.propertiesScanned ?? 0;
      if (this.missingFields.length === 0 && data.source === 'demo') {
        this.missingFields = DEMO_MISSING;
      }
    } catch {
      this.missingFields = DEMO_MISSING;
    }
    this.setCount(this.missingFields.length);
    this.renderContent();
  }

  private renderContent(): void {
    const grouped = new Map<string, MissingField[]>();
    for (const field of this.missingFields) {
      const group = grouped.get(field.propertyId) ?? [];
      grouped.set(field.propertyId, [...group, field]);
    }

    const critical = this.missingFields.filter((f) => f.severity === 'critical').length;
    const warning = this.missingFields.filter((f) => f.severity === 'warning').length;
    const info = this.missingFields.filter((f) => f.severity === 'info').length;

    const scannedNote = this.propertiesScanned > 0
      ? `<div class="md-scanned-note">Skenováno ${this.propertiesScanned} nemovitostí</div>`
      : '';

    let html = `
      <div class="missing-data-summary">
        <span class="md-badge md-critical">${critical} kritických</span>
        <span class="md-badge md-warning">${warning} varování</span>
        <span class="md-badge md-info">${info} doporučení</span>
        ${scannedNote}
      </div>
    `;

    for (const [, fields] of grouped) {
      const title = fields[0]?.propertyTitle ?? '';
      const worstSeverity = fields.some((f) => f.severity === 'critical') ? 'critical'
        : fields.some((f) => f.severity === 'warning') ? 'warning' : 'info';

      html += `
        <div class="missing-data-group md-group-${worstSeverity}">
          <div class="md-group-title">${escapeHtml(title)}</div>
          <div class="md-group-fields">
            ${fields.map((f) => `
              <div class="md-field md-${f.severity}">
                <span class="md-field-icon">${f.severity === 'critical' ? '⚠' : f.severity === 'warning' ? '⚡' : 'ℹ'}</span>
                <span class="md-field-label">${escapeHtml(f.fieldLabel)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    if (this.missingFields.length === 0) {
      html = '<div class="missing-data-summary"><em>Všechna data kompletní</em></div>';
    }

    this.setContent(`<div class="missing-data-list">${html}</div>`);
  }

  destroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    super.destroy();
  }
}
