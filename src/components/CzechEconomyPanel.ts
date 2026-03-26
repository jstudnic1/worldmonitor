import { Panel } from './Panel';

export class CzechEconomyPanel extends Panel {
  constructor() {
    super({
      id: 'czech-economy',
      title: 'Česká ekonomika',
      infoTooltip: 'Aktuální makroekonomická data (Březen 2026)',
    });
    this.renderContent();
  }

  private renderContent(): void {
    const html = `
      <div style="padding: 12px; font-family: Inter, Roboto, sans-serif;">
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
          <thead>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: #888;">
              <th style="padding: 8px 4px;">Ukazatel</th>
              <th style="padding: 8px 4px; text-align: right;">Hodnota</th>
              <th style="padding: 8px 4px; text-align: right;">Trend</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding: 10px 4px;" title="Česká národní banka (Březen 2026)">2T Repo Sazba (ČNB)</td>
              <td style="padding: 10px 4px; text-align: right; font-weight: 600;">3.50 %</td>
              <td style="padding: 10px 4px; text-align: right; color: #9ca3af;">→ 0.00 pb</td>
            </tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding: 10px 4px;" title="Průměrná tržní sazba únor 2026">Průměrná hypotéka</td>
              <td style="padding: 10px 4px; text-align: right; font-weight: 600;">4.46 %</td>
              <td style="padding: 10px 4px; text-align: right; color: #4ade80;">↓ Pokles</td>
            </tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding: 10px 4px;" title="Meziroční inflace únor 2026 (ČSÚ)">Meziroční inflace</td>
              <td style="padding: 10px 4px; text-align: right; font-weight: 600;">1.4 %</td>
              <td style="padding: 10px 4px; text-align: right; color: #4ade80;">↓ -0.2 pb</td>
            </tr>
            <tr>
              <td style="padding: 10px 4px;" title="Uzavírací referenční kurz ECB (25.3.2026)">Kurz CZK/EUR</td>
              <td style="padding: 10px 4px; text-align: right; font-weight: 600;">24.47</td>
              <td style="padding: 10px 4px; text-align: right; color: #9ca3af;">→ Stabilní</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    this.setContent(html);
  }
}
