import { Panel } from './Panel';

export class LegalRegulationPanel extends Panel {
  constructor() {
    super({
      id: 'legal-regulation',
      title: 'Legislativa',
      infoTooltip: 'Zákony a regulace 2026',
    });
    this.renderContent();
  }

  private renderContent(): void {
    const html = `
      <div style="padding: 12px; font-family: Inter, Roboto, sans-serif; font-size: 13px;">
        <div style="margin-bottom: 12px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 6px; border-left: 3px solid #eab308;">
          <div style="font-weight: 600; margin-bottom: 4px;">Úprava limitů pro investiční hypotéky (ČNB)</div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 11px; padding: 2px 6px; background: rgba(234,179,8,0.2); color: #facc15; border-radius: 4px;">Schváleno</span>
            <span style="color: #888; font-size: 12px;">Účinnost od: 1. 4. 2026</span>
          </div>
          <div style="color: #aaa; line-height: 1.4;">Přísnější podmínky LTV a příjmové limity pro úvěry na třetí a další nemovitost. Dopad: Zpřísnění pro investory, mírné ochlazení nájmů.</div>
        </div>
        
        <div style="margin-bottom: 12px; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 6px; border-left: 3px solid #3b82f6;">
          <div style="font-weight: 600; margin-bottom: 4px;">Urychlení Povolování staveb (Nový stavební zákon)</div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 11px; padding: 2px 6px; background: rgba(59,130,246,0.2); color: #60a5fa; border-radius: 4px;">V platnosti</span>
            <span style="color: #888; font-size: 12px;">Plné nasazení Portálu stavebníka</span>
          </div>
          <div style="color: #aaa; line-height: 1.4;">Zásadní zrychlení úředních lhůt a odvolacích procesů. Dopad: Rychlejší náběh nových developerských projektů.</div>
        </div>
        
        <div style="padding: 10px; background: rgba(255,255,255,0.03); border-radius: 6px; border-left: 3px solid #10b981;">
          <div style="font-weight: 600; margin-bottom: 4px;">Nová dotační vlna (Zelená úsporám 2026)</div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 11px; padding: 2px 6px; background: rgba(16,185,129,0.2); color: #34d399; border-radius: 4px;">V platnosti</span>
            <span style="color: #888; font-size: 12px;">Spuštěno jaro 2026</span>
          </div>
          <div style="color: #aaa; line-height: 1.4;">Vyšší štědrost dotací na energetické štítky a solární panely na bytové domy. Dopad: Tlak na renovaci energeticky neúčinných budov.</div>
        </div>
      </div>
    `;
    this.setContent(html);
  }
}
