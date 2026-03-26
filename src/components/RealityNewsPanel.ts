import { Panel } from './Panel';

export class RealityNewsPanel extends Panel {
  constructor() {
    super({
      id: 'reality-news',
      title: 'Realitní zprávy',
      infoTooltip: 'Skutečné události a sentiment (Březen 2026)',
    });
    this.renderContent();
  }

  private renderContent(): void {
    const html = `
      <div style="padding: 12px; font-family: Inter, Roboto, sans-serif; font-size: 13px;">
        <div style="margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="background: rgba(30,58,138,0.5); color: #93c5fd; padding: 2px 6px; font-size: 10px; border-radius: 4px; font-weight: 600;">Hypotéky</span>
              <span style="color: #888; font-size: 11px;">E15 • Před 3h</span>
            </div>
          </div>
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 6px; line-height: 1.3;">ČNB doporučuje zpřísnit podmínky pro investiční hypotéky na třetí byt, nutných bude 30 % vlastních zdrojů.</div>
          <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #facc15;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #facc15; box-shadow: 0 0 6px #facc15;"></span> Ochlazení investiční poptávky
          </div>
        </div>
        
        <div style="margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="background: rgba(69,26,3,0.5); color: #fdba74; padding: 2px 6px; font-size: 10px; border-radius: 4px; font-weight: 600;">Rezidenční</span>
              <span style="color: #888; font-size: 11px;">Kurzy.cz • Včera</span>
            </div>
          </div>
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 6px; line-height: 1.3;">Start roku 2026 přinesl oživení trhu, únorový hypoteční objem dosáhl 57 miliard. Jde o 5. nejsilnější měsíc v historii.</div>
          <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #4ade80;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 6px #4ade80;"></span> Oživení aktivity na trhu
          </div>
        </div>
        
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="background: rgba(6,78,59,0.5); color: #6ee7b7; padding: 2px 6px; font-size: 10px; border-radius: 4px; font-weight: 600;">Development</span>
              <span style="color: #888; font-size: 11px;">Forbes • Včera</span>
            </div>
          </div>
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 6px; line-height: 1.3;">Developeři čím dál více ustupují od kanceláří a začínají stavět celé nové rezidenční čtvrti.</div>
          <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #9ca3af;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #9ca3af; box-shadow: 0 0 6px #9ca3af;"></span> Dlouhodobý nárůst nabídky
          </div>
        </div>
      </div>
    `;
    this.setContent(html);
  }
}
