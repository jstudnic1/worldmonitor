import { request as requestHttp } from 'node:http';
import { connect as connectHttp2 } from 'node:http2';
import { request as requestHttps } from 'node:https';

const DEFAULT_MODEL = 'gpt-5-mini';
const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_LOCAL_ROUTE = 'inference.local';
const BUNDLE_CACHE_TTL_MS = 5 * 60 * 1000;
const AGENT_MODES = new Set(['auto', 'openrouter', 'openclaw']);
const HOOK_WAKE_MODES = new Set(['now', 'next-heartbeat']);

const bundleCache = new Map();

function envFlag(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function normalizeMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return AGENT_MODES.has(normalized) ? normalized : 'auto';
}

function normalizeWakeMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return HOOK_WAKE_MODES.has(normalized) ? normalized : 'now';
}

function isLocalLikeHostname(hostname) {
  return hostname === '127.0.0.1'
    || hostname === 'localhost'
    || hostname === '::1'
    || hostname.endsWith('.local');
}

function inferLocalRouteName(baseUrl) {
  try {
    const url = new URL(baseUrl);
    return isLocalLikeHostname(url.hostname) ? DEFAULT_LOCAL_ROUTE : '';
  } catch {
    return '';
  }
}

function shouldAllowInsecureTls(baseUrl, explicitFlag) {
  if (!explicitFlag) return false;
  try {
    const url = new URL(baseUrl);
    return isLocalLikeHostname(url.hostname);
  } catch {
    return false;
  }
}

function isRemoteRuntimeEnvironment() {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV || process.env.NOW_REGION);
}

function isLocallyHostedGateway(baseUrl) {
  try {
    const url = new URL(baseUrl);
    return isLocalLikeHostname(url.hostname);
  } catch {
    return false;
  }
}

function getGatewayConfig() {
  const baseUrl = String(process.env.OPENCLAW_BASE_URL || '').replace(/\/+$/, '');
  const explicitRouteName = String(process.env.OPENCLAW_ROUTE_NAME || '').trim();
  const explicitModel = String(process.env.OPENCLAW_MODEL || '').trim();

  return {
    baseUrl,
    token: process.env.OPENCLAW_GATEWAY_TOKEN || process.env.OPENCLAW_API_KEY || '',
    model: explicitModel,
    timeoutMs: Number(process.env.OPENCLAW_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    defaultMode: normalizeMode(process.env.OPENCLAW_DEFAULT_MODE || 'auto'),
    enableMonitorEnrichment: envFlag('OPENCLAW_MONITOR_ENRICHMENT', false),
    routeName: explicitRouteName || inferLocalRouteName(baseUrl),
    allowInsecureTls: envFlag('OPENCLAW_ALLOW_INSECURE_TLS', true),
  };
}

function getHooksConfig() {
  const gatewayConfig = getGatewayConfig();
  const hookPath = String(process.env.OPENCLAW_HOOKS_PATH || '/hooks').trim() || '/hooks';

  return {
    ...gatewayConfig,
    path: hookPath.startsWith('/') ? hookPath : `/${hookPath}`,
    token: process.env.OPENCLAW_HOOKS_TOKEN || process.env.OPENCLAW_GATEWAY_TOKEN || process.env.OPENCLAW_API_KEY || '',
    agentId: String(process.env.OPENCLAW_HOOKS_AGENT_ID || '').trim(),
    allowRequestSessionKey: envFlag('OPENCLAW_HOOKS_ALLOW_REQUEST_SESSION_KEY', false),
    defaultSessionKey: String(process.env.OPENCLAW_HOOKS_DEFAULT_SESSION_KEY || '').trim(),
    defaultChannel: String(process.env.OPENCLAW_HOOKS_DEFAULT_CHANNEL || '').trim() || 'last',
    defaultThinking: String(process.env.OPENCLAW_HOOKS_THINKING || '').trim(),
    defaultDeliver: envFlag('OPENCLAW_HOOKS_DELIVER', false),
    defaultTimeoutSeconds: Number(process.env.OPENCLAW_HOOKS_TIMEOUT_SECONDS || 120),
  };
}

export function isOpenClawConfigured() {
  const config = getGatewayConfig();
  if (isRemoteRuntimeEnvironment() && isLocallyHostedGateway(config.baseUrl)) {
    return false;
  }
  return Boolean(config.baseUrl && (config.token || config.routeName));
}

export function isOpenClawHooksConfigured() {
  const config = getHooksConfig();
  return Boolean(config.baseUrl && config.token);
}

export function resolveAgentMode(requestedMode) {
  const mode = normalizeMode(requestedMode);
  if (mode !== 'auto') return mode;
  return getGatewayConfig().defaultMode;
}

function buildHeaders(token, extraHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function fetchJsonWithTimeout(url, options, timeoutMs) {
  if (options?.allowInsecureTls) {
    return requestJsonWithTimeout(url, options, timeoutMs);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      throw new Error(`OpenClaw ${response.status}: ${text || response.statusText}`);
    }
    return data || {};
  } finally {
    clearTimeout(timer);
  }
}

function requestJsonWithTimeout(urlString, options, timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const requestImpl = url.protocol === 'https:' ? requestHttps : requestHttp;
    const req = requestImpl({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: options?.method || 'GET',
      headers: options?.headers || {},
      rejectUnauthorized: !shouldAllowInsecureTls(url.origin, true),
    }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        text += chunk;
      });
      response.on('end', () => {
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }

        const statusCode = Number(response.statusCode || 0);
        if (statusCode >= 400) {
          reject(new Error(`OpenClaw ${statusCode}: ${text || response.statusMessage || 'request failed'}`));
          return;
        }

        resolve(data || {});
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('OpenClaw request timed out.'));
    });
    req.on('error', reject);

    if (options?.body) {
      req.write(options.body);
    }

    req.end();
  });
}

function joinUrl(baseUrl, path) {
  const normalizedBase = `${String(baseUrl || '').replace(/\/+$/, '')}/`;
  return new URL(String(path || '').replace(/^\/+/, ''), normalizedBase).toString();
}

function buildHookUrl(baseUrl, path, endpoint) {
  const normalizedPath = String(path || '/hooks').replace(/\/+$/, '');
  return joinUrl(baseUrl, `${normalizedPath}/${String(endpoint || '').replace(/^\/+/, '')}`);
}

function normalizeSessionPart(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function buildOpenClawSessionKey(...parts) {
  const segments = parts.flatMap((part) => {
    if (Array.isArray(part)) return part;
    return [part];
  }).map(normalizeSessionPart).filter(Boolean);

  if (segments.length === 0) {
    return 'hook:worldmonitor:ingress';
  }

  return ['hook', 'worldmonitor', ...segments].join(':');
}

async function postHookPayload(config, endpoint, payload) {
  if (!config.baseUrl || !config.token) {
    throw new Error('OpenClaw hooks nejsou nakonfigurované.');
  }

  return fetchJsonWithTimeout(buildHookUrl(config.baseUrl, config.path, endpoint), {
    method: 'POST',
    headers: buildHeaders(config.token),
    body: JSON.stringify(payload),
    allowInsecureTls: shouldAllowInsecureTls(config.baseUrl, config.allowInsecureTls),
  }, config.timeoutMs);
}

export async function sendOpenClawWake({
  text,
  mode = 'now',
}) {
  const config = getHooksConfig();
  const normalizedText = String(text || '').trim();
  if (!normalizedText) {
    throw new Error('OpenClaw wake vyžaduje neprázdný text.');
  }

  await postHookPayload(config, 'wake', {
    text: normalizedText,
    mode: normalizeWakeMode(mode),
  });

  return {
    accepted: true,
    runtime: 'OpenClaw Hooks',
    endpoint: 'wake',
    mode: normalizeWakeMode(mode),
  };
}

export async function sendOpenClawAgentHook({
  message,
  name,
  agentId,
  sessionKey,
  wakeMode = 'now',
  deliver,
  channel,
  to,
  model,
  thinking,
  timeoutSeconds,
}) {
  const config = getHooksConfig();
  const normalizedMessage = String(message || '').trim();
  if (!normalizedMessage) {
    throw new Error('OpenClaw agent hook vyžaduje neprázdnou zprávu.');
  }

  const payload = {
    message: normalizedMessage,
    wakeMode: normalizeWakeMode(wakeMode),
    deliver: deliver ?? config.defaultDeliver,
    channel: channel || config.defaultChannel,
    timeoutSeconds: Number(timeoutSeconds || config.defaultTimeoutSeconds || 120),
  };

  const resolvedName = String(name || '').trim();
  if (resolvedName) payload.name = resolvedName;

  const resolvedAgentId = String(agentId || config.agentId || '').trim();
  if (resolvedAgentId) payload.agentId = resolvedAgentId;

  const resolvedModel = String(model || config.model || '').trim();
  if (resolvedModel) payload.model = resolvedModel;

  const resolvedThinking = String(thinking || config.defaultThinking || '').trim();
  if (resolvedThinking) payload.thinking = resolvedThinking;

  const resolvedTo = String(to || '').trim();
  if (resolvedTo) payload.to = resolvedTo;

  const resolvedSessionKey = String(sessionKey || config.defaultSessionKey || '').trim();
  if (resolvedSessionKey && config.allowRequestSessionKey) {
    payload.sessionKey = resolvedSessionKey;
  }

  await postHookPayload(config, 'agent', payload);

  return {
    accepted: true,
    runtime: 'OpenClaw Hooks',
    endpoint: 'agent',
    agentId: resolvedAgentId || null,
    sessionKey: resolvedSessionKey || null,
    sessionKeyApplied: Boolean(resolvedSessionKey && config.allowRequestSessionKey),
    wakeMode: payload.wakeMode,
    deliver: payload.deliver,
    channel: payload.channel,
    model: payload.model || null,
    thinking: payload.thinking || null,
  };
}

function toResponsesTools(tools) {
  return (Array.isArray(tools) ? tools : [])
    .filter((tool) => tool?.type === 'function' && tool.function?.name)
    .map((tool) => ({
      type: 'function',
      name: tool.function.name,
      description: tool.function.description || '',
      parameters: tool.function.parameters || { type: 'object', properties: {} },
    }));
}

function toResponsesInput(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.role && typeof message.content === 'string')
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

function extractOutputText(response) {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const output = Array.isArray(response?.output) ? response.output : [];
  const parts = [];
  for (const item of output) {
    if (item?.type !== 'message') continue;
    const content = Array.isArray(item.content) ? item.content : [];
    for (const chunk of content) {
      if (typeof chunk?.text === 'string' && chunk.text.trim()) {
        parts.push(chunk.text.trim());
      } else if (typeof chunk?.output_text === 'string' && chunk.output_text.trim()) {
        parts.push(chunk.output_text.trim());
      }
    }
  }
  return parts.join('\n\n').trim();
}

function extractFunctionCalls(response) {
  const output = Array.isArray(response?.output) ? response.output : [];
  return output.filter((item) => item?.type === 'function_call' && item.name);
}

function extractJsonCandidate(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function encodeVarint(value) {
  let current = BigInt(value);
  const bytes = [];
  while (current >= 0x80n) {
    bytes.push(Number((current & 0x7fn) | 0x80n));
    current >>= 7n;
  }
  bytes.push(Number(current));
  return Buffer.from(bytes);
}

function readVarint(buffer, startOffset) {
  let offset = startOffset;
  let shift = 0n;
  let value = 0n;

  while (offset < buffer.length) {
    const byte = BigInt(buffer[offset]);
    value |= (byte & 0x7fn) << shift;
    offset += 1;
    if ((byte & 0x80n) === 0n) {
      return { value, offset };
    }
    shift += 7n;
  }

  throw new Error('Invalid protobuf varint.');
}

function encodeStringField(fieldNumber, value) {
  const content = Buffer.from(String(value || ''), 'utf8');
  return Buffer.concat([
    encodeVarint((fieldNumber << 3) | 2),
    encodeVarint(content.length),
    content,
  ]);
}

function frameGrpcMessage(message) {
  const header = Buffer.alloc(5);
  header.writeUInt8(0, 0);
  header.writeUInt32BE(message.length, 1);
  return Buffer.concat([header, message]);
}

function decodeGrpcMessage(grpcBuffer) {
  const buffer = Buffer.isBuffer(grpcBuffer) ? grpcBuffer : Buffer.from(grpcBuffer);
  if (buffer.length < 5) {
    throw new Error('OpenShell returned an invalid gRPC frame.');
  }
  const compressed = buffer.readUInt8(0);
  if (compressed !== 0) {
    throw new Error('Compressed gRPC responses are not supported.');
  }
  const messageLength = buffer.readUInt32BE(1);
  const start = 5;
  const end = start + messageLength;
  if (buffer.length < end) {
    throw new Error('OpenShell returned a truncated gRPC frame.');
  }
  return buffer.subarray(start, end);
}

function readLengthDelimitedField(buffer, offset) {
  const { value: rawLength, offset: nextOffset } = readVarint(buffer, offset);
  const length = Number(rawLength);
  const end = nextOffset + length;
  if (end > buffer.length) {
    throw new Error('Invalid protobuf length-delimited field.');
  }
  return {
    bytes: buffer.subarray(nextOffset, end),
    offset: end,
  };
}

function skipField(buffer, offset, wireType) {
  if (wireType === 0) {
    return readVarint(buffer, offset).offset;
  }
  if (wireType === 2) {
    return readLengthDelimitedField(buffer, offset).offset;
  }
  throw new Error(`Unsupported protobuf wire type: ${wireType}`);
}

function decodeInferenceBundle(bundleBuffer) {
  const bundle = {
    routeName: '',
    baseUrl: '',
    protocols: [],
    apiKey: '',
    modelId: '',
    providerType: '',
  };

  let offset = 0;
  while (offset < bundleBuffer.length) {
    const { value: rawTag, offset: nextTagOffset } = readVarint(bundleBuffer, offset);
    const tag = Number(rawTag);
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;
    offset = nextTagOffset;

    if (wireType === 2) {
      const field = readLengthDelimitedField(bundleBuffer, offset);
      const text = field.bytes.toString('utf8');
      offset = field.offset;

      if (fieldNumber === 1) bundle.routeName = text;
      else if (fieldNumber === 2) bundle.baseUrl = text;
      else if (fieldNumber === 3) bundle.protocols.push(text);
      else if (fieldNumber === 4) bundle.apiKey = text;
      else if (fieldNumber === 5) bundle.modelId = text;
      else if (fieldNumber === 6) bundle.providerType = text;
      continue;
    }

    offset = skipField(bundleBuffer, offset, wireType);
  }

  return bundle;
}

function decodeInferenceBundleResponse(grpcBuffer) {
  const message = decodeGrpcMessage(grpcBuffer);
  const response = {
    bundle: null,
    bundleId: '',
    generatedAtMs: null,
  };

  let offset = 0;
  while (offset < message.length) {
    const { value: rawTag, offset: nextTagOffset } = readVarint(message, offset);
    const tag = Number(rawTag);
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;
    offset = nextTagOffset;

    if (wireType === 2) {
      const field = readLengthDelimitedField(message, offset);
      offset = field.offset;

      if (fieldNumber === 1) response.bundle = decodeInferenceBundle(field.bytes);
      else if (fieldNumber === 2) response.bundleId = field.bytes.toString('utf8');
      continue;
    }

    if (wireType === 0) {
      const varint = readVarint(message, offset);
      offset = varint.offset;
      if (fieldNumber === 3) {
        response.generatedAtMs = varint.value;
      }
      continue;
    }

    offset = skipField(message, offset, wireType);
  }

  return response;
}

function createGrpcPath(pathname) {
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

function callOpenShellUnary({ baseUrl, pathname, payload, timeoutMs, allowInsecureTls }) {
  return new Promise((resolve, reject) => {
    const target = new URL(baseUrl);
    const client = connectHttp2(target.origin, {
      rejectUnauthorized: !shouldAllowInsecureTls(baseUrl, allowInsecureTls),
    });

    let settled = false;
    let responseHeaders = {};
    let responseTrailers = {};
    const chunks = [];

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.close();
      if (err) reject(err);
      else resolve(value);
    };

    const timer = setTimeout(() => {
      finish(new Error('OpenShell gRPC request timed out.'));
    }, timeoutMs);

    client.on('error', (err) => finish(err));

    const request = client.request({
      ':method': 'POST',
      ':path': createGrpcPath(pathname),
      ':scheme': target.protocol.replace(':', ''),
      ':authority': target.host,
      'content-type': 'application/grpc',
      te: 'trailers',
    });

    request.on('response', (headers) => {
      responseHeaders = headers;
    });

    request.on('trailers', (trailers) => {
      responseTrailers = trailers;
    });

    request.on('data', (chunk) => {
      chunks.push(Buffer.from(chunk));
    });

    request.on('end', () => {
      const grpcStatus = Number(responseTrailers['grpc-status'] ?? responseHeaders['grpc-status'] ?? 0);
      const grpcMessageRaw = responseTrailers['grpc-message'] ?? responseHeaders['grpc-message'] ?? '';
      const grpcMessage = grpcMessageRaw ? decodeURIComponent(String(grpcMessageRaw)) : '';
      if (grpcStatus !== 0) {
        finish(new Error(`OpenShell gRPC ${grpcStatus}: ${grpcMessage || 'unknown error'}`));
        return;
      }
      finish(null, Buffer.concat(chunks));
    });

    request.on('error', (err) => finish(err));
    request.end(frameGrpcMessage(payload));
  });
}

async function fetchOpenShellInferenceBundle(config) {
  if (!config.baseUrl || !config.routeName) {
    throw new Error('OpenShell inference bundle není nakonfigurovaný.');
  }

  const cacheKey = `${config.baseUrl}|${config.routeName}`;
  const cached = bundleCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const requestPayload = encodeStringField(1, config.routeName);
  const grpcBuffer = await callOpenShellUnary({
    baseUrl: config.baseUrl,
    pathname: '/openshell.inference.v1.Inference/GetInferenceBundle',
    payload: requestPayload,
    timeoutMs: config.timeoutMs,
    allowInsecureTls: config.allowInsecureTls,
  });

  const decoded = decodeInferenceBundleResponse(grpcBuffer);
  if (!decoded.bundle?.baseUrl || !decoded.bundle?.apiKey) {
    throw new Error('OpenShell bundle nevrátil použitelný inference endpoint.');
  }

  bundleCache.set(cacheKey, {
    expiresAt: Date.now() + BUNDLE_CACHE_TTL_MS,
    value: decoded,
  });

  return decoded;
}

async function postResponsesPayload(config, payload) {
  if (config.token) {
    const directPayload = {
      ...payload,
      model: payload.model || config.model || DEFAULT_MODEL,
    };

    try {
      const response = await fetchJsonWithTimeout(joinUrl(config.baseUrl, '/v1/responses'), {
        method: 'POST',
        headers: buildHeaders(config.token),
        body: JSON.stringify(directPayload),
        allowInsecureTls: shouldAllowInsecureTls(config.baseUrl, config.allowInsecureTls),
      }, config.timeoutMs);

      return {
        data: response,
        model: response.model || directPayload.model,
        runtime: 'OpenClaw Gateway',
        routeName: '',
      };
    } catch (err) {
      if (!config.routeName || !String(err?.message || '').includes('404')) {
        throw err;
      }
    }
  }

  const bundleResponse = await fetchOpenShellInferenceBundle(config);
  const bundle = bundleResponse.bundle;

  if (!Array.isArray(bundle.protocols) || !bundle.protocols.includes('openai_responses')) {
    throw new Error('OpenShell bundle nepodporuje OpenAI Responses API.');
  }

  const response = await fetchJsonWithTimeout(joinUrl(bundle.baseUrl, '/responses'), {
    method: 'POST',
    headers: buildHeaders(bundle.apiKey),
    body: JSON.stringify({
      ...payload,
      model: payload.model || bundle.modelId || config.model || DEFAULT_MODEL,
    }),
    allowInsecureTls: shouldAllowInsecureTls(bundle.baseUrl, config.allowInsecureTls),
  }, config.timeoutMs);

  return {
    data: response,
    model: response.model || payload.model || bundle.modelId || config.model || DEFAULT_MODEL,
    runtime: `OpenShell Bundle (${bundle.routeName || config.routeName})`,
    routeName: bundle.routeName || config.routeName,
    providerType: bundle.providerType || '',
    bundleId: bundleResponse.bundleId || '',
  };
}

export function formatOpenClawToolLabel(name) {
  const labels = {
    search_properties: 'Vyhledání nemovitostí',
    get_market_stats: 'Tržní statistiky',
    search_clients: 'Vyhledání klientů',
    get_leads: 'Načtení leadů',
    get_calendar: 'Kontrola kalendáře',
    find_missing_data: 'Audit chybějících dat',
    match_client_properties: 'Párování klient–nemovitost',
    get_alerts: 'Načtení alertů',
    get_price_history: 'Historie cen',
    send_email: 'Odeslání e-mailu',
    create_lead: 'Vytvoření leadu',
    create_calendar_event: 'Vytvoření události',
    create_alert: 'Vytvoření alertu',
  };
  return labels[name] || name;
}

function buildPreviewSteps(prompt) {
  const normalized = String(prompt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const steps = [
    { label: 'Načtení session kontextu a operátorských preferencí', status: 'info' },
    { label: 'Výběr vhodných interních skills a nástrojů', status: 'info' },
  ];

  if (normalized.includes('email')) {
    steps.push({ label: 'Vyhledání klienta a kontextu nemovitosti', status: 'info' });
    steps.push({ label: 'Kontrola kalendáře a návrh termínů', status: 'info' });
    steps.push({ label: 'Příprava nebo odeslání e-mailu podle schválení', status: 'warning' });
  } else if (normalized.includes('lead')) {
    steps.push({ label: 'Analýza pipeline a sourcingu leadů', status: 'info' });
    steps.push({ label: 'Návrh follow-up kroků pro obchodní tým', status: 'info' });
  } else if (normalized.includes('monitor') || normalized.includes('nabidk')) {
    steps.push({ label: 'Sběr listingů napříč portály nebo přes browser skill', status: 'info' });
    steps.push({ label: 'Syntéza ranního digestu a doporučených akcí', status: 'info' });
  } else {
    steps.push({ label: 'Kombinace datových dotazů, paměti a akčních nástrojů', status: 'info' });
    steps.push({ label: 'Vrácení strukturovaného výstupu pro UI a další workflow', status: 'info' });
  }

  steps.push({ label: 'Vrácení výstupu do worldmonitor backendu pro zápis artefaktů a alertů', status: 'info' });
  return steps;
}

export function buildOpenClawPreviewResponse(prompt) {
  const steps = buildPreviewSteps(prompt);
  return {
    content: 'OpenClaw Gateway zatím není nakonfigurovaný, takže vracím preview toho, jak by agent tento požadavek zpracoval.',
    result: {
      title: 'OpenClaw Preview',
      summary: 'Ukázka agentického orchestration flow bez živého připojení ke Gateway.',
      source: 'openclaw-preview',
      artifacts: [
        {
          kind: 'metrics',
          title: 'Co by OpenClaw přidal',
          metrics: [
            { label: 'Režim', value: 'Agent orchestration' },
            { label: 'Paměť', value: 'Session + workflow context' },
            { label: 'Kanály', value: 'Chat + background jobs' },
          ],
        },
        {
          kind: 'checklist',
          title: 'Plánované kroky',
          items: steps,
        },
      ],
      nextSteps: [
        'Nastavte OPENCLAW_BASE_URL a OPENCLAW_GATEWAY_TOKEN nebo lokální OPENCLAW_ROUTE_NAME.',
        'Potom přepněte chat do režimu OpenClaw a zkuste stejný dotaz znovu.',
      ],
    },
  };
}

export async function runOpenClawConversation({
  instructions,
  messages,
  tools,
  executeTool,
  maxRounds = 5,
  metadata,
}) {
  const config = getGatewayConfig();
  if (!config.baseUrl || (!config.token && !config.routeName)) {
    throw new Error('OpenClaw Gateway není nakonfigurovaný.');
  }

  const responseTools = toResponsesTools(tools);
  let previousResponseId = null;
  let input = toResponsesInput(messages);
  const toolTrace = [];
  let runtime = config.token ? 'OpenClaw Gateway' : `OpenShell Bundle (${config.routeName})`;
  let resolvedModel = config.model || null;

  for (let round = 0; round < maxRounds; round += 1) {
    const payload = previousResponseId
      ? {
          previous_response_id: previousResponseId,
          input,
          tools: responseTools,
        }
      : {
          instructions,
          input,
          tools: responseTools,
          metadata,
        };

    if (resolvedModel) {
      payload.model = resolvedModel;
    }

    const responsePayload = await postResponsesPayload(config, payload);
    const response = responsePayload.data;
    runtime = responsePayload.runtime || runtime;
    resolvedModel = responsePayload.model || resolvedModel;

    previousResponseId = response.id || previousResponseId;
    const functionCalls = extractFunctionCalls(response);
    if (functionCalls.length > 0) {
      const toolOutputs = [];
      for (const call of functionCalls) {
        let args = {};
        try {
          args = JSON.parse(call.arguments || '{}');
        } catch {
          args = {};
        }

        toolTrace.push(call.name);

        let result;
        try {
          result = await executeTool(call.name, args);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }

        toolOutputs.push({
          type: 'function_call_output',
          call_id: call.call_id || call.id,
          output: JSON.stringify(result),
        });
      }
      input = toolOutputs;
      continue;
    }

    return {
      content: extractOutputText(response) || 'OpenClaw dokončil běh bez textového výstupu.',
      toolTrace,
      responseId: response.id || null,
      model: response.model || resolvedModel,
      runtime,
    };
  }

  throw new Error('OpenClaw nedokončil běh v limitu kol.');
}

export async function enrichMonitorDigestWithOpenClaw({
  monitor,
  listings,
  summaryText,
  source,
}) {
  const config = getGatewayConfig();
  if (!config.baseUrl || (!config.token && !config.routeName) || !config.enableMonitorEnrichment) {
    return null;
  }

  const listingPreview = (Array.isArray(listings) ? listings : []).slice(0, 10).map((listing) => ({
    title: listing.title,
    portal: listing.portal,
    city: listing.city,
    district: listing.district,
    price: listing.price,
    url: listing.url,
  }));

  const prompt = [
    'Jsi agent pro ranní monitoring realitních portálů.',
    'Vrať pouze JSON objekt se schématem:',
    '{"summary":"string","alertDescription":"string","nextSteps":["string"],"headline":"string"}',
    `Monitor: ${monitor.name || monitor.location_query || 'monitor'}`,
    `Lokalita: ${monitor.location_query || 'nezadáno'}`,
    `Zdroje: ${(Array.isArray(monitor.sources) ? monitor.sources : []).join(', ')}`,
    `Deterministický souhrn: ${summaryText}`,
    `Listing source: ${source}`,
    `Listingy: ${JSON.stringify(listingPreview)}`,
  ].join('\n');

  const responsePayload = await postResponsesPayload(config, {
    input: prompt,
    metadata: {
      workflow: 'monitor-digest',
      location: monitor.location_query || '',
    },
  });

  const response = responsePayload.data;
  const text = extractOutputText(response);
  if (!text) return null;

  try {
    const parsed = JSON.parse(extractJsonCandidate(text));
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : summaryText,
      alertDescription: typeof parsed.alertDescription === 'string' ? parsed.alertDescription : null,
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps.filter((item) => typeof item === 'string') : [],
      headline: typeof parsed.headline === 'string' ? parsed.headline : null,
      model: response.model || responsePayload.model || config.model,
      runtime: responsePayload.runtime || 'OpenClaw',
    };
  } catch {
    return null;
  }
}
