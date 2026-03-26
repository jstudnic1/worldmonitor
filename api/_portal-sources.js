const KNOWN_PORTAL_LABELS = {
  sreality: 'Sreality',
  bezrealitky: 'Bezrealitky',
  reality_idnes: 'Reality.iDNES',
  flatzone: 'Flat Zone',
  dashboard: 'Dashboard',
  email: 'E-mail',
};

const PORTAL_ALIASES = {
  idnes: 'reality_idnes',
  'reality.idnes': 'reality_idnes',
  'reality idnes': 'reality_idnes',
  'flat-zone': 'flatzone',
  'flat zone': 'flatzone',
};

export const DEFAULT_MONITOR_SOURCES = ['sreality', 'bezrealitky', 'reality_idnes', 'flatzone'];

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeHeaderMap(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return normalizeHeaderMap(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, headerValue]) => key && headerValue !== null && headerValue !== undefined && String(headerValue).trim())
      .map(([key, headerValue]) => [key, String(headerValue)]),
  );
}

function resolveFeedToken(config) {
  if (config.token && String(config.token).trim()) return String(config.token).trim();
  if (config.tokenEnv && process.env[config.tokenEnv]) return String(process.env[config.tokenEnv]).trim();
  return '';
}

function normalizeExternalFeedConfig(config) {
  if (!config || typeof config !== 'object') return null;

  const portal = normalizePortalSlug(config.portal || config.slug || config.source);
  const url = String(config.url || config.feedUrl || '').trim();
  if (!portal || !url) return null;

  const token = resolveFeedToken(config);
  const authHeader = String(config.authHeader || config.tokenHeader || 'Authorization').trim();
  const authScheme = String(config.authScheme || config.tokenPrefix || 'Bearer').trim();
  const headers = normalizeHeaderMap(config.headers);

  if (token) {
    headers[authHeader] = authScheme ? `${authScheme} ${token}` : token;
  }

  return {
    portal,
    label: String(config.label || config.name || KNOWN_PORTAL_LABELS[portal] || portal).trim(),
    url,
    arrayPath: String(config.arrayPath || config.path || '').trim(),
    listingKind: normalizeListingKind(config.listingKind || config.kind),
    defaultType: normalizeDefaultType(config.defaultType || config.propertyType || config.type),
    isCompetitor: toBoolean(config.isCompetitor, true),
    createAlerts: toBoolean(config.createAlerts, true),
    timeoutMs: toPositiveInt(config.timeoutMs, 12000),
    headers,
  };
}

function normalizeListingKind(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'project') return 'project';
  return 'listing';
}

function normalizeDefaultType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'byt';
  if (normalized.includes('dum') || normalized.includes('dům')) return 'dům';
  if (normalized.includes('pozem')) return 'pozemek';
  if (normalized.includes('komerc') || normalized.includes('obchod') || normalized.includes('kancel') || normalized.includes('sklad')) {
    return 'komerční';
  }
  return 'byt';
}

export function normalizePortalSlug(value) {
  const normalized = String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (!normalized) return 'other';
  const aliased = PORTAL_ALIASES[normalized] || normalized;
  const slug = aliased
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return slug || 'other';
}

export function formatPortalLabel(value) {
  const normalized = normalizePortalSlug(value);
  if (KNOWN_PORTAL_LABELS[normalized]) return KNOWN_PORTAL_LABELS[normalized];
  if (!value) return 'Neznámý zdroj';

  return normalized
    .split('_')
    .filter(Boolean)
    .map((part) => (
      part.length <= 3
        ? part.toUpperCase()
        : `${part.charAt(0).toUpperCase()}${part.slice(1)}`
    ))
    .join(' ');
}

export function getConfiguredExternalFeeds() {
  const feeds = [];

  if (process.env.REALITY_EXTERNAL_FEEDS) {
    try {
      const parsed = JSON.parse(process.env.REALITY_EXTERNAL_FEEDS);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const config = normalizeExternalFeedConfig(item);
          if (config) feeds.push(config);
        }
      }
    } catch (error) {
      console.error('[external-feeds] Failed to parse REALITY_EXTERNAL_FEEDS:', error instanceof Error ? error.message : String(error));
    }
  }

  if (process.env.FLATZONE_FEED_URL) {
    const flatzoneConfig = normalizeExternalFeedConfig({
      portal: 'flatzone',
      label: 'Flat Zone',
      url: process.env.FLATZONE_FEED_URL,
      arrayPath: process.env.FLATZONE_FEED_ARRAY_PATH || 'projects',
      listingKind: process.env.FLATZONE_FEED_KIND || 'project',
      defaultType: process.env.FLATZONE_DEFAULT_TYPE || 'byt',
      tokenEnv: 'FLATZONE_FEED_TOKEN',
      authHeader: process.env.FLATZONE_FEED_HEADER || 'Authorization',
      authScheme: process.env.FLATZONE_FEED_PREFIX || 'Bearer',
      timeoutMs: process.env.FLATZONE_FEED_TIMEOUT_MS || 12000,
    });
    if (flatzoneConfig) feeds.push(flatzoneConfig);
  }

  const deduped = new Map();
  for (const feed of feeds) {
    const key = `${feed.portal}|${feed.url}`;
    if (!deduped.has(key)) deduped.set(key, feed);
  }
  return [...deduped.values()];
}

export function getExternalFeedsExample() {
  return [
    {
      portal: 'flatzone',
      label: 'Flat Zone',
      url: 'https://partner.example.cz/flatzone/projects.json',
      arrayPath: 'projects',
      listingKind: 'project',
      defaultType: 'byt',
      tokenEnv: 'FLATZONE_FEED_TOKEN',
      authHeader: 'Authorization',
      authScheme: 'Bearer',
      createAlerts: true,
    },
  ];
}
