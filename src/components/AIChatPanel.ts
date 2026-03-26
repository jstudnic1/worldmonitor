import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

const CHART_COLORS = [
  'rgba(68, 255, 136, 0.85)',
  'rgba(68, 136, 255, 0.85)',
  'rgba(255, 136, 68, 0.85)',
  'rgba(255, 68, 170, 0.85)',
  'rgba(170, 68, 255, 0.85)',
  'rgba(68, 220, 255, 0.85)',
];
const CHART_BG = [
  'rgba(68, 255, 136, 0.18)',
  'rgba(68, 136, 255, 0.18)',
  'rgba(255, 136, 68, 0.18)',
  'rgba(255, 68, 170, 0.18)',
  'rgba(170, 68, 255, 0.18)',
  'rgba(68, 220, 255, 0.18)',
];

let chartIdSeq = 0;

type AgentMetric = {
  label: string;
  value: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'critical';
};

type ChartSeries = {
  name: string;
  values: number[];
};

type TableArtifact = {
  kind: 'table';
  title?: string;
  columns: string[];
  rows: Array<Array<string | number | null>>;
};

type ChartArtifact = {
  kind: 'chart';
  title?: string;
  chartType?: 'bar' | 'line';
  labels: string[];
  series: ChartSeries[];
  unit?: string;
};

type EmailArtifact = {
  kind: 'email';
  title?: string;
  subject: string;
  to?: string;
  body: string;
  suggestedSlots?: string[];
};

type MetricsArtifact = {
  kind: 'metrics';
  title?: string;
  metrics: AgentMetric[];
};

type ChecklistItem = {
  label: string;
  detail?: string;
  status?: 'info' | 'warning' | 'critical';
};

type ChecklistArtifact = {
  kind: 'checklist';
  title?: string;
  items: ChecklistItem[];
};

type Slide = {
  title: string;
  bullets: string[];
};

type SlidesArtifact = {
  kind: 'slides';
  title?: string;
  slides: Slide[];
};

type ScheduleArtifact = {
  kind: 'schedule';
  title?: string;
  name?: string;
  location?: string;
  scheduleLabel?: string;
  sources?: string[];
  channel?: string;
  status?: string;
};

type UnknownArtifact = {
  kind: string;
  title?: string;
  [key: string]: unknown;
};

type AgentArtifact =
  | TableArtifact
  | ChartArtifact
  | EmailArtifact
  | MetricsArtifact
  | ChecklistArtifact
  | SlidesArtifact
  | ScheduleArtifact
  | UnknownArtifact;

type ArtifactRef = {
  id: string;
  kind: string;
  title: string;
};

type StructuredResult = {
  title?: string;
  summary?: string;
  source?: string;
  artifacts?: AgentArtifact[];
  nextSteps?: string[];
  artifactRefs?: ArtifactRef[];
};

type AgentMode = 'auto' | 'openrouter' | 'openclaw';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  result?: StructuredResult | null;
};

const CHAT_HISTORY_KEY = 'reality-chat-history';
const CHAT_AGENT_MODE_KEY = 'reality-chat-agent-mode';
const MAX_HISTORY = 50;

function normalizePrompt(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export class AIChatPanel extends Panel {
  private messages: ChatMessage[] = [];
  private inputEl: HTMLTextAreaElement | null = null;
  private messagesEl: HTMLElement | null = null;
  private isStreaming = false;
  private agentMode: AgentMode = 'auto';
  private pendingCharts: Map<string, ChartArtifact> = new Map();
  private activeCharts: Chart[] = [];

  constructor() {
    super({
      id: 'ai-chat',
      title: 'AI Asistent',
      className: 'panel-wide ai-chat-panel',
    });
    this.agentMode = this.loadAgentMode();
    this.loadHistory();
    this.render();
  }

  private loadAgentMode(): AgentMode {
    try {
      const stored = localStorage.getItem(CHAT_AGENT_MODE_KEY);
      if (stored === 'openrouter' || stored === 'openclaw') return stored;
    } catch {
      // Ignore storage failures.
    }
    return 'auto';
  }

  private saveAgentMode(): void {
    localStorage.setItem(CHAT_AGENT_MODE_KEY, this.agentMode);
  }

  private loadHistory(): void {
    try {
      const stored = localStorage.getItem(CHAT_HISTORY_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return;
      this.messages = parsed
        .filter((item): item is ChatMessage => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
        .slice(-MAX_HISTORY);
    } catch {
      this.messages = [];
    }
  }

  private saveHistory(): void {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(this.messages.slice(-MAX_HISTORY)));
  }

  private buildLocalAutoResponse(text: string): { content: string; result: StructuredResult } {
    const normalized = normalizePrompt(text);

    if ((normalized.includes('nov') && normalized.includes('klient')) || normalized.includes('klienti q1')) {
      return {
        content: 'Za 1. kvartál eviduji 18 nových klientů. Nejvíce přišli z portálů, doporučení a přímých webových poptávek.',
        result: {
          title: 'Noví klienti za 1. kvartál',
          summary: 'Rychlý přehled akvizičních zdrojů a tempa přísunu klientů.',
          source: 'demo',
          artifacts: [
            {
              kind: 'metrics',
              title: 'Souhrn',
              metrics: [
                { label: 'Noví klienti', value: '18' },
                { label: 'Největší zdroj', value: 'Reality portály' },
                { label: 'Doporučení', value: '28 %', tone: 'positive' },
              ],
            },
            {
              kind: 'table',
              title: 'Zdroje klientů',
              columns: ['Zdroj', 'Počet', 'Podíl'],
              rows: [
                ['Portály', '7', '39 %'],
                ['Doporučení', '5', '28 %'],
                ['Web / direct', '4', '22 %'],
                ['Sociální sítě', '2', '11 %'],
              ],
            },
          ],
          nextSteps: [
            'Zesilte follow-up u doporučení, mají nejlepší konverzi.',
            'U webových leadů doplňte konzistentní source tagging.',
          ],
        },
      };
    }

    if ((normalized.includes('lead') && normalized.includes('prodej')) || normalized.includes('leady vs prodeje')) {
      return {
        content: 'Za posledních 6 měsíců je v pipeline vidět stabilní růst leadů a pozvolný nárůst uzavřených prodejů.',
        result: {
          title: 'Leady vs prodané nemovitosti',
          summary: 'Srovnání akviziční pipeline a uzavřených obchodů za posledních 6 měsíců.',
          source: 'demo',
          artifacts: [
            {
              kind: 'chart',
              title: 'Vývoj pipeline',
              chartType: 'line',
              labels: ['Říj', 'Lis', 'Pro', 'Led', 'Úno', 'Bře'],
              unit: 'počet',
              series: [
                { name: 'Leady', values: [14, 16, 18, 22, 25, 28] },
                { name: 'Prodeje', values: [5, 6, 7, 8, 9, 11] },
              ],
            },
            {
              kind: 'metrics',
              title: 'KPI',
              metrics: [
                { label: 'Leady', value: '123' },
                { label: 'Prodeje', value: '50' },
                { label: 'Closing rate', value: '41 %', tone: 'positive' },
              ],
            },
          ],
          nextSteps: [
            'Zkontrolujte kvalitu leadů z posledních 2 měsíců.',
            'Porovnejte closing rate po zdrojích akvizice.',
          ],
        },
      };
    }

    if ((normalized.includes('email') || normalized.includes('e-mail')) && (normalized.includes('prohlid') || normalized.includes('termin') || normalized.includes('kalendar'))) {
      return {
        content: 'Připravil jsem návrh e-mailu a vytáhl 3 vhodné sloty pro prohlídku podle kalendáře.',
        result: {
          title: 'Návrh e-mailu pro zájemce',
          summary: 'Koncept e-mailu s doporučenými termíny prohlídky.',
          source: 'demo',
          artifacts: [
            {
              kind: 'email',
              title: 'E-mailový koncept',
              subject: 'Návrh termínu prohlídky nemovitosti',
              to: 'Jan Novák',
              body: 'Dobrý den,\n\nna základě Vašeho zájmu o nemovitost Vám mohu nabídnout tyto termíny prohlídky:\n- Čt 16:00\n- Pá 10:30\n- Po 14:00\n\nPokud Vám některý z termínů vyhovuje, prosím potvrďte jej odpovědí na tento e-mail.\n\nS pozdravem\nReality Monitor',
              suggestedSlots: ['Čt 16:00', 'Pá 10:30', 'Po 14:00'],
            },
          ],
          nextSteps: [
            'Po potvrzení slotu založte událost do kalendáře.',
            'Doplňte ke zprávě adresu a parkovací instrukce.',
          ],
        },
      };
    }

    if ((normalized.includes('rekonstruk') || normalized.includes('stavebn')) && (normalized.includes('chybi') || normalized.includes('doplnen'))) {
      return {
        content: 'Našel jsem 2 aktivní nemovitosti, kde chybí údaje o rekonstrukci nebo stavebních úpravách.',
        result: {
          title: 'Chybějící data o rekonstrukcích',
          summary: 'Přehled nabídek, kde je potřeba doplnit provozně důležitá data před další prezentací klientům.',
          source: 'demo',
          artifacts: [
            {
              kind: 'metrics',
              title: 'Souhrn',
              metrics: [
                { label: 'Aktivní nemovitosti s mezerami', value: '2' },
                { label: 'Priorita', value: 'Vysoká', tone: 'warning' },
              ],
            },
            {
              kind: 'table',
              title: 'Seznam k doplnění',
              columns: ['Nemovitost', 'Město', 'Chybějící pole'],
              rows: [
                ['Byt 1+kk, Karlín', 'Praha', 'rok poslední rekonstrukce, stavební úpravy, poznámka k rekonstrukci'],
                ['Komerční prostor, Centrum', 'Praha', 'stav rekonstrukce, rok poslední rekonstrukce, stavební úpravy, poznámka k rekonstrukci'],
              ],
            },
            {
              kind: 'checklist',
              title: 'Prioritní checklist',
              items: [
                { status: 'critical', label: 'Byt 1+kk, Karlín', detail: 'Doplnit rok poslední rekonstrukce a stavební úpravy.' },
                { status: 'critical', label: 'Komerční prostor, Centrum', detail: 'Doplnit kompletní blok rekonstrukčních údajů.' },
              ],
            },
          ],
          nextSteps: [
            'Doplňte údaje ještě před další prezentací klientům.',
            'Zvažte kontrolu těchto polí před publikací nové nabídky.',
          ],
        },
      };
    }

    if ((normalized.includes('report') || normalized.includes('shrn') || normalized.includes('veden')) && (normalized.includes('slide') || normalized.includes('prezentac'))) {
      return {
        content: 'Připravil jsem krátký management report a návrh prezentace se třemi slidy.',
        result: {
          title: 'Týdenní report pro vedení',
          summary: 'Stručné obchodní shrnutí s navrženou strukturou pro prezentaci.',
          source: 'demo',
          artifacts: [
            {
              kind: 'metrics',
              title: 'Týdenní KPI',
              metrics: [
                { label: 'Nové leady', value: '12' },
                { label: 'Uzavřené prodeje', value: '4', tone: 'positive' },
                { label: 'Nové listingy', value: '9' },
              ],
            },
            {
              kind: 'slides',
              title: 'Návrh 3 slidů',
              slides: [
                { title: 'Výkon týdne', bullets: ['12 nových leadů', '4 uzavřené prodeje', 'Stabilní růst poptávky v Praze a Brně'] },
                { title: 'Trh a pipeline', bullets: ['Rostoucí objem kvalifikovaných leadů', 'Nejlepší konverze mají doporučení a direct web', 'Komerční segment je pomalejší než rezidenční'] },
                { title: 'Další kroky', bullets: ['Vyčistit chybějící data u top nabídek', 'Posílit follow-up u leadů do 24h', 'Dokončit monitorovací workflow pro klíčové lokality'] },
              ],
            },
          ],
          nextSteps: [
            'Doplňte k reportu jména konkrétních transakcí pro vedení.',
            'Připravte z něj finální prezentaci nebo e-mailový briefing.',
          ],
        },
      };
    }

    if (normalized.includes('monitor') || normalized.includes('sleduj') || normalized.includes('rano')) {
      return {
        content: 'Připravil jsem monitor workflow pro ranní digest nových nabídek.',
        result: {
          title: 'Monitoring portálů',
          summary: 'Denní workflow pro sledování nových nabídek a ranní briefing.',
          source: 'demo',
          artifacts: [
            {
              kind: 'schedule',
              title: 'Ranní digest',
              name: 'Praha Holešovice - nové nabídky',
              location: 'Praha Holešovice',
              scheduleLabel: 'Každý den 08:00',
              sources: ['Sreality', 'Reality.iDNES', 'Flat Zone'],
              channel: 'Dashboard + e-mail',
              status: 'Připraveno',
            },
          ],
          nextSteps: [
            'Doplňte cenové a dispoziční filtry.',
            'Zapněte finální doručovací kanál pro tým.',
          ],
        },
      };
    }

    return {
      content: 'V Auto režimu nyní nejlépe fungují workflow dotazy na klienty, pipeline, e-maily, rekonstrukce, reporty a monitoring.',
      result: {
        title: 'Auto Režim',
        summary: 'Rychlý demo workflow assistant pro back-office scénáře.',
        source: 'demo',
        artifacts: [
          {
            kind: 'checklist',
            title: 'Zkuste například',
            items: [
              { status: 'info', label: 'Klienti Q1', detail: 'Noví klienti a jejich zdroje.' },
              { status: 'info', label: 'Leady vs prodeje', detail: 'Graf pipeline za 6 měsíců.' },
              { status: 'info', label: 'Email + termín', detail: 'Draft e-mailu a termíny prohlídky.' },
              { status: 'info', label: 'Rekonstrukce', detail: 'Chybějící data u nabídek.' },
              { status: 'info', label: 'Report + slidy', detail: 'Shrnutí pro vedení.' },
            ],
          },
        ],
        nextSteps: [
          'Klikněte na některý z quick promptů pod chatem.',
          'Pro volnější konverzaci přepněte do OpenRouter nebo OpenClaw.',
        ],
      },
    };
  }

  private render(): void {
    const container = document.createElement('div');
    container.className = 'ai-chat-container';

    this.messagesEl = document.createElement('div');
    this.messagesEl.className = 'ai-chat-messages';
    container.appendChild(this.messagesEl);

    const inputRow = document.createElement('div');
    inputRow.className = 'ai-chat-input-row';

    const modeRow = document.createElement('div');
    modeRow.className = 'ai-chat-mode-row';
    const modes: Array<{ id: AgentMode; label: string }> = [
      { id: 'auto', label: 'Auto' },
      { id: 'openrouter', label: 'OpenRouter' },
      { id: 'openclaw', label: 'OpenClaw' },
    ];

    for (const mode of modes) {
      const button = document.createElement('button');
      button.className = `ai-chat-mode-btn${this.agentMode === mode.id ? ' is-active' : ''}`;
      button.textContent = mode.label;
      button.addEventListener('click', () => {
        this.agentMode = mode.id;
        this.saveAgentMode();
        this.render();
      });
      modeRow.appendChild(button);
    }

    container.appendChild(modeRow);

    this.inputEl = document.createElement('textarea');
    this.inputEl.className = 'ai-chat-input';
    this.inputEl.placeholder = 'Ptejte se na klienty, reporty, leady, e-maily nebo workflow...';
    this.inputEl.rows = 1;
    this.inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void this.sendMessage();
      }
    });
    this.inputEl.addEventListener('input', () => {
      if (!this.inputEl) return;
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = `${Math.min(this.inputEl.scrollHeight, 120)}px`;
    });

    const sendBtn = document.createElement('button');
    sendBtn.className = 'ai-chat-send';
    sendBtn.textContent = '→';
    sendBtn.addEventListener('click', () => void this.sendMessage());

    inputRow.appendChild(this.inputEl);
    inputRow.appendChild(sendBtn);
    container.appendChild(inputRow);

    const quickActions = document.createElement('div');
    quickActions.className = 'ai-chat-quick-actions';
    const actions = [
      {
        label: 'Klienti Q1',
        query: 'Jaké nové klienty máme za 1. kvartál? Odkud přišli? Můžeš to znázornit graficky?',
      },
      {
        label: 'Leady vs prodeje',
        query: 'Vytvoř graf vývoje počtu leadů a prodaných nemovitostí za posledních 6 měsíců.',
      },
      {
        label: 'Email + termín',
        query: 'Napiš e-mail pro zájemce o moji nemovitost a doporuč mu termín prohlídky na základě mé dostupnosti v kalendáři.',
      },
      {
        label: 'Rekonstrukce',
        query: 'Najdi nemovitosti, u kterých nám v systému chybí data o rekonstrukci a stavebních úpravách a připrav jejich seznam k doplnění.',
      },
      {
        label: 'Report + slidy',
        query: 'Shrň výsledky minulého týdne do krátkého reportu pro vedení a připrav k tomu prezentaci se třemi slidy.',
      },
      {
        label: 'Monitoring',
        query: 'Sleduj všechny hlavní realitní servery a každé ráno mě informuj o nových nabídkách v lokalitě Praha Holešovice.',
      },
      {
        label: 'Naplánuj prohlídku',
        query: 'Naplánuj prohlídku bytu 3+kk na Vinohradech pro klienta Jana Nováka na příští pondělí v 14:00. Přidej to do kalendáře.',
      },
      {
        label: 'Spáruj klienta',
        query: 'Najdi vhodné nemovitosti pro klientku Hanu Markovou dle jejích preferencí a rozpočtu.',
      },
    ];

    for (const action of actions) {
      const button = document.createElement('button');
      button.className = 'ai-chat-quick-btn';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        if (!this.inputEl) return;
        this.inputEl.value = action.query;
        void this.sendMessage();
      });
      quickActions.appendChild(button);
    }

    container.appendChild(quickActions);
    this.content.innerHTML = '';
    this.content.appendChild(container);
    this.renderMessages();
  }

  private renderMessages(): void {
    if (!this.messagesEl) return;
    if (this.messages.length === 0) {
      this.messagesEl.innerHTML = `
        <div class="ai-chat-welcome">
          <div class="ai-chat-welcome-icon">🏠</div>
          <div class="ai-chat-welcome-title">Back Office Operations Agent</div>
          <div class="ai-chat-welcome-text">
            Umím vracet nejen text, ale i tabulky, grafy, e-mailové koncepty, checklisty,
            týdenní reporty a návrhy workflow pro realitní back office.
          </div>
        </div>
      `;
      return;
    }

    this.messagesEl.innerHTML = this.messages.map((message) => {
      const isAssistant = message.role === 'assistant';
      const cls = isAssistant ? 'ai-chat-msg-assistant' : 'ai-chat-msg-user';
      const richCls = isAssistant && message.result ? ' ai-chat-msg-rich' : '';
      const label = isAssistant ? 'AI' : 'Vy';
      const body = message.content
        ? `<div class="ai-chat-msg-body">${this.formatMarkdown(message.content)}</div>`
        : '';
      const result = isAssistant && message.result ? this.renderStructuredResult(message.result) : '';

      return `<div class="ai-chat-msg ${cls}${richCls}">
        <div class="ai-chat-msg-header"><span class="ai-chat-msg-role">${label}</span></div>
        ${body}
        ${result}
      </div>`;
    }).join('');

    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    this.attachActionHandlers();
    this.initPendingCharts();
  }

  private attachActionHandlers(): void {
    if (!this.messagesEl) return;

    this.messagesEl.querySelectorAll('.ai-action-btn').forEach((btn) => {
      const el = btn as HTMLButtonElement;
      if (el.dataset.bound) return;
      el.dataset.bound = '1';

      el.addEventListener('click', () => {
        const action = el.dataset.action;
        if (action === 'send') {
          void this.handleSendEmail(el);
        } else if (action === 'copy') {
          void this.handleCopyText(el);
        }
      });
    });
  }

  private async handleSendEmail(btn: HTMLButtonElement): Promise<void> {
    const subject = btn.dataset.subject || '';
    const to = btn.dataset.to || '';
    const body = btn.dataset.body || '';

    btn.disabled = true;
    btn.textContent = 'Odesílám...';

    try {
      // Ask the AI agent to send the email using its send_email tool
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: `Odešli tento e-mail na adresu ${to || 'klienta'}. Předmět: "${subject}". Text:\n\n${body}` },
          ],
        }),
      });

      if (response.ok) {
        btn.textContent = 'Odesláno';
        btn.classList.add('ai-action-done');
      } else {
        btn.textContent = 'Chyba — zkuste znovu';
        btn.disabled = false;
      }
    } catch {
      btn.textContent = 'Chyba — zkuste znovu';
      btn.disabled = false;
    }
  }

  private async handleCopyText(btn: HTMLButtonElement): Promise<void> {
    const body = btn.dataset.body || '';
    try {
      await navigator.clipboard.writeText(body);
      btn.textContent = 'Zkopírováno';
      setTimeout(() => { btn.textContent = 'Kopírovat text'; }, 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = body;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      btn.textContent = 'Zkopírováno';
      setTimeout(() => { btn.textContent = 'Kopírovat text'; }, 2000);
    }
  }

  private renderStructuredResult(result: StructuredResult): string {
    const header = result.title
      ? `<div class="ai-result-title">${escapeHtml(result.title)}</div>`
      : '';
    const summary = result.summary
      ? `<div class="ai-result-summary">${escapeHtml(result.summary)}</div>`
      : '';
    const source = result.source
      ? `<span class="ai-result-badge">${escapeHtml(this.formatSourceLabel(result.source))}</span>`
      : '';
    const storedCount = result.artifactRefs?.length
      ? `<span class="ai-result-badge">${result.artifactRefs.length} uložené artefakty</span>`
      : '';
    const artifacts = (result.artifacts ?? []).map((artifact) => this.renderArtifact(artifact)).join('');
    const nextSteps = result.nextSteps?.length
      ? `<div class="ai-artifact-card">
          <div class="ai-artifact-title">Doporučené další kroky</div>
          <ul class="ai-next-steps">
            ${result.nextSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}
          </ul>
        </div>`
      : '';

    return `
      <div class="ai-result-shell">
        <div class="ai-result-head">
          <div class="ai-result-head-main">
            ${header}
            ${summary}
          </div>
          <div class="ai-result-meta">
            ${source}
            ${storedCount}
          </div>
        </div>
        <div class="ai-artifacts">${artifacts}${nextSteps}</div>
      </div>
    `;
  }

  private renderArtifact(artifact: AgentArtifact): string {
    switch (artifact.kind) {
      case 'metrics':
        return this.renderMetricsArtifact(artifact as MetricsArtifact);
      case 'table':
        return this.renderTableArtifact(artifact as TableArtifact);
      case 'chart':
        return this.renderChartArtifact(artifact as ChartArtifact);
      case 'email':
        return this.renderEmailArtifact(artifact as EmailArtifact);
      case 'checklist':
        return this.renderChecklistArtifact(artifact as ChecklistArtifact);
      case 'slides':
        return this.renderSlidesArtifact(artifact as SlidesArtifact);
      case 'schedule':
        return this.renderScheduleArtifact(artifact as ScheduleArtifact);
      default:
        return `<div class="ai-artifact-card">
          <div class="ai-artifact-title">${escapeHtml(artifact.title || artifact.kind || 'Výstup')}</div>
          <pre class="ai-artifact-json">${escapeHtml(JSON.stringify(artifact, null, 2))}</pre>
        </div>`;
    }
  }

  private renderMetricsArtifact(artifact: MetricsArtifact): string {
    return `<div class="ai-artifact-card">
      ${artifact.title ? `<div class="ai-artifact-title">${escapeHtml(artifact.title)}</div>` : ''}
      <div class="ai-metrics-grid">
        ${artifact.metrics.map((metric) => `
          <div class="ai-metric-card ai-metric-${escapeHtml(metric.tone || 'neutral')}">
            <div class="ai-metric-label">${escapeHtml(metric.label)}</div>
            <div class="ai-metric-value">${escapeHtml(metric.value)}</div>
          </div>
        `).join('')}
      </div>
    </div>`;
  }

  private renderTableArtifact(artifact: TableArtifact): string {
    return `<div class="ai-artifact-card">
      ${artifact.title ? `<div class="ai-artifact-title">${escapeHtml(artifact.title)}</div>` : ''}
      <div class="ai-table-wrap">
        <table class="ai-data-table">
          <thead>
            <tr>${artifact.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${artifact.rows.map((row) => `
              <tr>${row.map((cell) => `<td>${escapeHtml(this.formatCell(cell))}</td>`).join('')}</tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  private renderChartArtifact(artifact: ChartArtifact): string {
    const canvasId = `ai-chart-${++chartIdSeq}`;
    this.pendingCharts.set(canvasId, artifact);

    return `<div class="ai-artifact-card">
      ${artifact.title ? `<div class="ai-artifact-title">${escapeHtml(artifact.title)}</div>` : ''}
      <div class="ai-chart-canvas-wrap">
        <canvas id="${canvasId}" height="260"></canvas>
      </div>
    </div>`;
  }

  private initPendingCharts(): void {
    // Destroy old charts to prevent memory leaks
    for (const chart of this.activeCharts) {
      chart.destroy();
    }
    this.activeCharts = [];

    for (const [canvasId, artifact] of this.pendingCharts) {
      const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
      if (!canvas) continue;

      const isLine = artifact.chartType === 'line';
      const datasets = artifact.series.map((s, i) => ({
        label: s.name,
        data: s.values.map((v) => Number(v) || 0),
        backgroundColor: isLine ? CHART_BG[i % CHART_BG.length] : CHART_COLORS[i % CHART_COLORS.length],
        borderColor: CHART_COLORS[i % CHART_COLORS.length],
        borderWidth: isLine ? 2.5 : 1,
        borderRadius: isLine ? 0 : 4,
        fill: isLine,
        tension: 0.35,
        pointRadius: isLine ? 4 : 0,
        pointBackgroundColor: CHART_COLORS[i % CHART_COLORS.length],
      }));

      const chart = new Chart(canvas, {
        type: isLine ? 'line' : 'bar',
        data: { labels: artifact.labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 600, easing: 'easeOutQuart' },
          plugins: {
            legend: {
              display: artifact.series.length > 1,
              position: 'top',
              labels: { color: 'rgba(255,255,255,0.7)', font: { size: 11 }, boxWidth: 12, padding: 12 },
            },
            tooltip: {
              backgroundColor: 'rgba(20,20,30,0.95)',
              titleColor: '#fff',
              bodyColor: 'rgba(255,255,255,0.85)',
              borderColor: 'rgba(255,255,255,0.1)',
              borderWidth: 1,
              padding: 10,
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}${artifact.unit ? ` ${artifact.unit}` : ''}`,
              },
            },
          },
          scales: {
            x: {
              grid: { color: 'rgba(255,255,255,0.06)' },
              ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } },
            },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(255,255,255,0.06)' },
              ticks: {
                color: 'rgba(255,255,255,0.5)',
                font: { size: 10 },
                callback: (val) => `${val}${artifact.unit ? ` ${artifact.unit}` : ''}`,
              },
            },
          },
        },
      });

      this.activeCharts.push(chart);
    }

    this.pendingCharts.clear();
  }

  private renderEmailArtifact(artifact: EmailArtifact): string {
    const emailId = `email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return `<div class="ai-artifact-card">
      ${artifact.title ? `<div class="ai-artifact-title">${escapeHtml(artifact.title)}</div>` : ''}
      <div class="ai-email-meta">
        <div><span class="ai-email-label">Komu:</span> ${escapeHtml(artifact.to || 'Zájemce')}</div>
        <div><span class="ai-email-label">Předmět:</span> ${escapeHtml(artifact.subject)}</div>
      </div>
      ${artifact.suggestedSlots?.length
        ? `<div class="ai-chip-list">
            ${artifact.suggestedSlots.map((slot) => `<span class="ai-chip">${escapeHtml(slot)}</span>`).join('')}
          </div>`
        : ''}
      <pre class="ai-email-body">${escapeHtml(artifact.body)}</pre>
      <div class="ai-email-actions" id="${emailId}">
        <button class="ai-action-btn ai-action-send" data-action="send" data-subject="${escapeHtml(artifact.subject)}" data-to="${escapeHtml(artifact.to || '')}" data-body="${escapeHtml(artifact.body)}">
          Odeslat e-mail
        </button>
        <button class="ai-action-btn ai-action-copy" data-action="copy" data-body="${escapeHtml(artifact.body)}">
          Kopírovat text
        </button>
      </div>
    </div>`;
  }

  private renderChecklistArtifact(artifact: ChecklistArtifact): string {
    return `<div class="ai-artifact-card">
      ${artifact.title ? `<div class="ai-artifact-title">${escapeHtml(artifact.title)}</div>` : ''}
      <div class="ai-checklist">
        ${artifact.items.map((item) => `
          <div class="ai-check-item">
            <span class="ai-check-status ai-check-${escapeHtml(item.status || 'info')}">${escapeHtml(this.formatStatusLabel(item.status))}</span>
            <div class="ai-check-body">
              <div class="ai-check-label">${escapeHtml(item.label)}</div>
              ${item.detail ? `<div class="ai-check-detail">${escapeHtml(item.detail)}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
  }

  private renderSlidesArtifact(artifact: SlidesArtifact): string {
    return `<div class="ai-artifact-card">
      ${artifact.title ? `<div class="ai-artifact-title">${escapeHtml(artifact.title)}</div>` : ''}
      <div class="ai-slides">
        ${artifact.slides.map((slide) => `
          <div class="ai-slide-card">
            <div class="ai-slide-title">${escapeHtml(slide.title)}</div>
            <ul class="ai-slide-bullets">
              ${slide.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}
            </ul>
          </div>
        `).join('')}
      </div>
    </div>`;
  }

  private renderScheduleArtifact(artifact: ScheduleArtifact): string {
    return `<div class="ai-artifact-card">
      ${artifact.title ? `<div class="ai-artifact-title">${escapeHtml(artifact.title)}</div>` : ''}
      <div class="ai-schedule-grid">
        ${artifact.name ? `<div><span class="ai-email-label">Workflow:</span> ${escapeHtml(artifact.name)}</div>` : ''}
        ${artifact.location ? `<div><span class="ai-email-label">Lokalita:</span> ${escapeHtml(artifact.location)}</div>` : ''}
        ${artifact.scheduleLabel ? `<div><span class="ai-email-label">Plán:</span> ${escapeHtml(artifact.scheduleLabel)}</div>` : ''}
        ${artifact.channel ? `<div><span class="ai-email-label">Kanál:</span> ${escapeHtml(artifact.channel)}</div>` : ''}
        ${artifact.status ? `<div><span class="ai-email-label">Stav:</span> ${escapeHtml(artifact.status)}</div>` : ''}
        ${artifact.sources?.length ? `<div><span class="ai-email-label">Zdroje:</span> ${escapeHtml(artifact.sources.join(', '))}</div>` : ''}
      </div>
    </div>`;
  }

  private formatCell(value: string | number | null): string {
    if (value === null || value === undefined || value === '') return '—';
    return String(value);
  }

  private formatStatusLabel(status?: string): string {
    switch (status) {
      case 'critical':
        return 'kritické';
      case 'warning':
        return 'varování';
      default:
        return 'info';
    }
  }

  private formatSourceLabel(source: string): string {
    if (source === 'supabase') return 'Živá data';
    if (source === 'hybrid') return 'Hybridní data';
    if (source === 'demo') return 'Demo data';
    if (source === 'openclaw') return 'OpenClaw';
    if (source === 'openclaw-preview') return 'OpenClaw preview';
    return source;
  }

  private formatMarkdown(text: string): string {
    const escaped = escapeHtml(text);
    return escaped
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  private buildOpenRouterFallbackResponse(text: string, reason: string): { content: string; result: StructuredResult } {
    const localResponse = this.buildLocalAutoResponse(text);
    return {
      content: `OpenRouter na hostované produkci teď nedoběhl včas, proto vracím lokální fallback pro demo.\n\n${localResponse.content}`,
      result: {
        ...(localResponse.result || {
          title: 'OpenRouter Fallback',
          summary: 'Lokální fallback odpověď pro hostované demo.',
          source: 'demo',
          artifacts: [],
          nextSteps: [],
        }),
        title: `${localResponse.result?.title || 'OpenRouter Fallback'} · Fallback`,
        summary: `Hostovaný OpenRouter backend nedoběhl včas. ${reason}`,
        source: 'demo',
      },
    };
  }

  private async sendMessage(): Promise<void> {
    if (!this.inputEl || this.isStreaming) return;
    const text = this.inputEl.value.trim();
    if (!text) return;

    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';

    this.messages = [...this.messages, { role: 'user', content: text, timestamp: Date.now() }];
    this.renderMessages();

    this.isStreaming = true;
    this.messages = [
      ...this.messages,
      { role: 'assistant', content: 'Připravuji odpověď...', timestamp: Date.now() },
    ];
    this.renderMessages();

    try {
      if (this.agentMode === 'auto') {
        const localResponse = this.buildLocalAutoResponse(text);
        this.messages = [
          ...this.messages.slice(0, -1),
          {
            role: 'assistant',
            content: localResponse.content,
            result: localResponse.result,
            timestamp: Date.now(),
          },
        ];
        return;
      }

      const controller = new AbortController();
      const timeoutMs = this.agentMode === 'openrouter' ? 9000 : 20000;
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentMode: this.agentMode,
            messages: this.messages.slice(0, -1).map((message) => ({
              role: message.role,
              content: message.content,
            })),
          }),
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timer);
      }

      let data: { content?: string; result?: StructuredResult; error?: string; message?: string } | null = null;
      try {
        data = await response.json() as { content?: string; result?: StructuredResult; error?: string; message?: string };
      } catch {
        data = null;
      }

      if (!response.ok) {
        const detail = data?.message || data?.content || data?.error || `HTTP ${response.status}`;
        if (this.agentMode === 'openrouter' && (response.status === 504 || response.status === 502 || response.status === 500)) {
          const fallback = this.buildOpenRouterFallbackResponse(text, `HTTP ${response.status}`);
          this.messages = [
            ...this.messages.slice(0, -1),
            {
              role: 'assistant',
              content: fallback.content,
              result: fallback.result,
              timestamp: Date.now(),
            },
          ];
          return;
        }
        throw new Error(detail);
      }

      this.messages = [
        ...this.messages.slice(0, -1),
        {
          role: 'assistant',
          content: data?.content || 'Výstup je připravený.',
          result: data?.result || null,
          timestamp: Date.now(),
        },
      ];
    } catch (err) {
      if (this.agentMode === 'openrouter') {
        const reason = err instanceof DOMException && err.name === 'AbortError'
          ? 'Timeout hostovaného backendu.'
          : err instanceof Error
            ? err.message
            : 'Neznámá chyba.';
        const fallback = this.buildOpenRouterFallbackResponse(text, reason);
        this.messages = [
          ...this.messages.slice(0, -1),
          {
            role: 'assistant',
            content: fallback.content,
            result: fallback.result,
            timestamp: Date.now(),
          },
        ];
        return;
      }

      const errorMsg = err instanceof DOMException && err.name === 'AbortError'
        ? 'Požadavek překročil časový limit'
        : err instanceof Error
          ? err.message
          : 'Neznámá chyba';
      this.messages = [
        ...this.messages.slice(0, -1),
        {
          role: 'assistant',
          content: `Chyba: ${errorMsg}. Zkuste to znovu.`,
          timestamp: Date.now(),
        },
      ];
    } finally {
      this.isStreaming = false;
      this.saveHistory();
      this.renderMessages();
    }
  }

  destroy(): void {
    for (const chart of this.activeCharts) chart.destroy();
    this.activeCharts = [];
    super.destroy();
  }
}
