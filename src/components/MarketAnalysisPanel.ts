import { Panel } from './Panel';

export class MarketAnalysisPanel extends Panel {
  constructor() {
    super({
      id: 'market-analysis',
      title: 'Analýza trhu',
      infoTooltip: 'Reálná data Sreality/RealityMix (Březen 2026)',
    });
    this.renderContent();
  }

  private renderContent(): void {
    const html = `
      <div class="market-analysis-table" style="padding: 12px; font-family: Inter, Roboto, sans-serif;">
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
          <thead>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: #888;">
              <th style="padding: 8px 4px;">Lokalita</th>
              <th style="padding: 8px 4px; text-align: right;">Cena / m²</th>
              <th style="padding: 8px 4px; text-align: right;">Trend (m/m)</th>
              <th style="padding: 8px 4px; text-align: right;">Nové byty</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding: 8px 4px; font-weight: 500;">Praha</td>
              <td style="padding: 8px 4px; text-align: right;">151 647 Kč</td>
              <td style="padding: 8px 4px; text-align: right; color: #4ade80;">↑ +0.5 %</td>
              <td style="padding: 8px 4px; text-align: right; color: #9ca3af;">176 tis.</td>
            </tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding: 8px 4px; font-weight: 500;">Brno</td>
              <td style="padding: 8px 4px; text-align: right;">121 930 Kč</td>
              <td style="padding: 8px 4px; text-align: right; color: #4ade80;">↑ +1.1 %</td>
              <td style="padding: 8px 4px; text-align: right; color: #9ca3af;">145 tis.</td>
            </tr>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding: 8px 4px; font-weight: 500;">Středočeský kraj</td>
              <td style="padding: 8px 4px; text-align: right;">85 200 Kč</td>
              <td style="padding: 8px 4px; text-align: right; color: #4ade80;">↑ +0.8 %</td>
              <td style="padding: 8px 4px; text-align: right; color: #9ca3af;">—</td>
            </tr>
            <tr>
              <td style="padding: 8px 4px; font-weight: 500;">Ostrava</td>
              <td style="padding: 8px 4px; text-align: right;">49 100 Kč</td>
              <td style="padding: 8px 4px; text-align: right; color: #9ca3af;">→ 0.0 %</td>
              <td style="padding: 8px 4px; text-align: right; color: #9ca3af;">—</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    this.setContent(html);
  }
}
