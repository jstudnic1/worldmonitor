import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';

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

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  result?: StructuredResult | null;
};

const CHAT_HISTORY_KEY = 'reality-chat-history';
const MAX_HISTORY = 50;

export class AIChatPanel extends Panel {
  private messages: ChatMessage[] = [];
  private inputEl: HTMLTextAreaElement | null = null;
  private messagesEl: HTMLElement | null = null;
  private isStreaming = false;

  constructor() {
    super({
      id: 'ai-chat',
      title: 'AI Asistent',
      className: 'panel-wide ai-chat-panel',
    });
    this.loadHistory();
    this.render();
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

  private render(): void {
    const container = document.createElement('div');
    container.className = 'ai-chat-container';

    this.messagesEl = document.createElement('div');
    this.messagesEl.className = 'ai-chat-messages';
    container.appendChild(this.messagesEl);

    const inputRow = document.createElement('div');
    inputRow.className = 'ai-chat-input-row';

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
    const allValues = artifact.series.flatMap((series) => series.values.map((value) => Number(value) || 0));
    const maxValue = Math.max(1, ...allValues);

    return `<div class="ai-artifact-card">
      ${artifact.title ? `<div class="ai-artifact-title">${escapeHtml(artifact.title)}</div>` : ''}
      <div class="ai-chart">
        ${artifact.labels.map((label, labelIndex) => `
          <div class="ai-chart-row">
            <div class="ai-chart-row-label">${escapeHtml(label)}</div>
            <div class="ai-chart-row-bars">
              ${artifact.series.map((series, seriesIndex) => {
                const value = Number(series.values[labelIndex] || 0);
                const width = `${Math.max(4, (value / maxValue) * 100)}%`;
                return `
                  <div class="ai-chart-series">
                    <div class="ai-chart-series-meta">
                      <span class="ai-chart-series-name">${escapeHtml(series.name)}</span>
                      <span class="ai-chart-series-value">${escapeHtml(`${value}${artifact.unit ? ` ${artifact.unit}` : ''}`)}</span>
                    </div>
                    <div class="ai-chart-track">
                      <div class="ai-chart-fill ai-chart-fill-${seriesIndex % 4}" style="width:${width}"></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
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
    return source;
  }

  private formatMarkdown(text: string): string {
    const escaped = escapeHtml(text);
    return escaped
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
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
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: this.messages.slice(0, -1).map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as { content?: string; result?: StructuredResult };
      this.messages = [
        ...this.messages.slice(0, -1),
        {
          role: 'assistant',
          content: data.content || 'Výstup je připravený.',
          result: data.result || null,
          timestamp: Date.now(),
        },
      ];
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Neznámá chyba';
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
    super.destroy();
  }
}
