import { normalizePortalSlug } from './_portal-sources.js';

const FLATZONE_BASE_URL = 'https://www.flatzone.cz';
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MAX_PROJECTS = 150;
const DEFAULT_MAX_SEEDS = 12;

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function stripTags(value) {
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function coerceNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  let normalized = String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/[^\d,.\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '');

  if (!normalized) return null;

  const commaCount = (normalized.match(/,/g) || []).length;
  const dotCount = (normalized.match(/\./g) || []).length;

  if (commaCount > 0 && dotCount > 0) {
    normalized = normalized.replace(/\./g, '').replace(/,/g, '.');
  } else if (commaCount === 1 && dotCount === 0) {
    normalized = normalized.replace(',', '.');
  } else if (dotCount > 1 && commaCount === 0) {
    normalized = normalized.replace(/\./g, '');
  } else {
    normalized = normalized.replace(/,/g, '');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function asIsoString(value, fallback) {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function normalizePropertyType(value, fallback = 'byt') {
  const normalized = normalizeText(value);
  if (!normalized) return fallback;
  if (normalized.includes('dum')) return 'dům';
  return 'byt';
}

function extractMeta(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]).trim();
  }
  return '';
}

function extractTitle(html) {
  const ogTitle = extractMeta(html, 'og:title');
  if (ogTitle) return ogTitle;
  const match = html.match(/<title>([^<]+)<\/title>/i);
  return match?.[1] ? decodeHtml(match[1]).trim() : '';
}

function extractDescription(html) {
  return extractMeta(html, 'og:description') || extractMeta(html, 'description') || '';
}

function extractJsonLd(html) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const results = [];
  for (const block of blocks) {
    const parsed = parseJson(block[1], null);
    if (!parsed) continue;
    if (Array.isArray(parsed)) results.push(...parsed);
    else results.push(parsed);
  }
  return results;
}

function inferLocationFromQuery(pageUrl) {
  try {
    const url = new URL(pageUrl);
    const query = url.searchParams.get('query');
    if (!query) return { city: '', district: '', address: '' };

    const parts = decodeURIComponent(query)
      .split('~')
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => normalizeText(part) !== 'ceska republika');

    const last = parts[parts.length - 1] || '';
    const prev = parts[parts.length - 2] || '';
    const looksLikeDistrictOnly = normalizeText(last).startsWith('okres ');
    const city = looksLikeDistrictOnly ? '' : last;
    const district = looksLikeDistrictOnly ? last : (prev || city);
    return {
      city,
      district,
      address: [city, district].filter(Boolean).join(', '),
    };
  } catch {
    return { city: '', district: '', address: '' };
  }
}

function inferLocationFromJsonLd(jsonLd, pageUrl) {
  for (const item of jsonLd) {
    const address = item?.address;
    if (address && typeof address === 'object') {
      const city = String(address.addressLocality || '').trim();
      const district = String(address.addressRegion || city || '').trim();
      const street = String(address.streetAddress || '').trim();
      const postalCode = String(address.postalCode || '').trim();
      return {
        city,
        district,
        address: [street, postalCode, city].filter(Boolean).join(', '),
      };
    }
  }

  return inferLocationFromQuery(pageUrl);
}

function inferCoordinates(html, jsonLd) {
  for (const item of jsonLd) {
    const geo = item?.geo;
    const lat = coerceNumber(geo?.latitude);
    const lon = coerceNumber(geo?.longitude);
    if (lat !== null && lon !== null) return { lat, lon };
  }

  const patterns = [
    /"latitude"\s*:\s*"?(?<lat>-?\d+(?:\.\d+)?)"?[\s,]+"longitude"\s*:\s*"?(?<lon>-?\d+(?:\.\d+)?)"?/i,
    /"lat"\s*:\s*"?(?<lat>-?\d+(?:\.\d+)?)"?[\s,]+"(?:lng|lon|longitude)"\s*:\s*"?(?<lon>-?\d+(?:\.\d+)?)"?/i,
    /data-lat=["'](?<lat>-?\d+(?:\.\d+)?)["'][^>]+data-(?:lng|lon)=["'](?<lon>-?\d+(?:\.\d+)?)["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const lat = coerceNumber(match?.groups?.lat);
    const lon = coerceNumber(match?.groups?.lon);
    if (lat !== null && lon !== null) return { lat, lon };
  }

  return { lat: null, lon: null };
}

function inferPrice(html) {
  const text = stripTags(html);
  const directPatterns = [
    /Cena(?:\s+od)?\s*[:\-]?\s*(\d[\d\s.,]*\s*K[čc])/i,
    /od\s+(\d[\d\s.,]*\s*K[čc])/i,
  ];

  for (const pattern of directPatterns) {
    const match = text.match(pattern);
    const price = coerceNumber(match?.[1]);
    if (price !== null) return price;
  }

  return null;
}

function inferArea(html) {
  const text = stripTags(html);
  const match = text.match(/(\d[\d\s.,]*)\s*m²/i);
  return coerceNumber(match?.[1]);
}

function inferRooms(title, html) {
  const raw = `${title} ${stripTags(html)}`;
  const match = raw.match(/\b(\d\+(?:kk|1|2|3))\b/i);
  return match?.[1] || null;
}

function inferUrlMetadata(pageUrl) {
  try {
    const url = new URL(pageUrl);
    return {
      project: decodeHtml(url.searchParams.get('project') || '').trim(),
      developer: decodeHtml(url.searchParams.get('developer') || '').trim(),
    };
  } catch {
    return { project: '', developer: '' };
  }
}

function inferDeveloper(title, pageUrl) {
  const meta = inferUrlMetadata(pageUrl);
  if (meta.developer) return meta.developer;

  const titleMatch = title.match(/developera?\s+(.+?)\s*\|\s*Flat Zone/i);
  if (titleMatch?.[1]) return titleMatch[1].trim();
  return '';
}

function sanitizeProjectTitle(title, pageUrl) {
  const meta = inferUrlMetadata(pageUrl);
  if (meta.project) return meta.project;

  return title
    .replace(/\|\s*Flat Zone\s*$/i, '')
    .replace(/^Projekt\s+/i, '')
    .replace(/\s+developera?\s+.+$/i, '')
    .trim();
}

function extractProjectLinks(html, sourceUrl) {
  const links = new Set();
  const source = String(sourceUrl || '').trim();

  if (source.includes('/projekt/')) {
    try {
      const absolute = new URL(source, FLATZONE_BASE_URL);
      absolute.hash = '';
      links.add(absolute.toString());
    } catch {
      // ignore malformed seed
    }
  }

  const hrefMatches = [...html.matchAll(/href=["']([^"']+)["']/gi)];

  for (const match of hrefMatches) {
    const href = decodeHtml(match[1] || '').trim();
    if (!href) continue;
    if (!href.includes('/projekt/')) continue;
    try {
      const absolute = new URL(href, sourceUrl || FLATZONE_BASE_URL);
      if (absolute.hostname !== 'www.flatzone.cz' && absolute.hostname !== 'flatzone.cz') continue;
      absolute.hash = '';
      links.add(absolute.toString());
    } catch {
      // ignore malformed links
    }
  }

  const rawPathMatches = [...html.matchAll(/\/projekt\/[^"'`\s<)]+/gi)];
  for (const match of rawPathMatches) {
    const rawPath = decodeHtml(match[0] || '').trim();
    if (!rawPath) continue;
    try {
      const absolute = new URL(rawPath, sourceUrl || FLATZONE_BASE_URL);
      absolute.hash = '';
      links.add(absolute.toString());
    } catch {
      // ignore malformed paths
    }
  }

  return [...links];
}

function resolveSeedUrls() {
  const raw = process.env.FLATZONE_SCRAPE_SEEDS || '';
  let seeds = [];

  if (raw.trim().startsWith('[')) {
    const parsed = parseJson(raw, []);
    if (Array.isArray(parsed)) seeds = parsed;
  } else {
    seeds = raw
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (seeds.length === 0) {
    return [
      'https://www.flatzone.cz/',
      'https://www.flatzone.cz/prvni-byt/',
      'https://www.flatzone.cz/investicni-byty/',
      'https://www.flatzone.cz/byt-pro-rodinu/',
    ];
  }

  return seeds.slice(0, toPositiveInt(process.env.FLATZONE_SCRAPE_MAX_SEEDS, DEFAULT_MAX_SEEDS));
}

async function fetchHtml(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'RealityMonitor/1.0 (+https://localhost)',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${await response.text()}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function discoverFlatZoneProjectUrls() {
  const seeds = resolveSeedUrls();
  const discovered = new Set();
  const errors = [];

  for (const seed of seeds) {
    try {
      const html = await fetchHtml(seed, toPositiveInt(process.env.FLATZONE_SCRAPE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS));
      const links = extractProjectLinks(html, seed);
      for (const link of links) discovered.add(link);
    } catch (error) {
      errors.push({
        seed,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    seeds,
    projectUrls: [...discovered].slice(0, toPositiveInt(process.env.FLATZONE_SCRAPE_MAX_PROJECTS, DEFAULT_MAX_PROJECTS)),
    errors,
  };
}

export async function scrapeFlatZoneProjects() {
  const discovery = await discoverFlatZoneProjectUrls();
  const listings = [];
  const errors = [...discovery.errors];

  for (const projectUrl of discovery.projectUrls) {
    try {
      const html = await fetchHtml(projectUrl, toPositiveInt(process.env.FLATZONE_SCRAPE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS));
      const jsonLd = extractJsonLd(html);
      const title = sanitizeProjectTitle(extractTitle(html), projectUrl);
      const description = extractDescription(html) || '';
      const location = inferLocationFromJsonLd(jsonLd, projectUrl);
      const coords = inferCoordinates(html, jsonLd);
      const developer = inferDeveloper(extractTitle(html), projectUrl);
      const notes = [
        'Developerský projekt',
        developer ? `Developer: ${developer}` : '',
        'Zdroj: Flat Zone public web',
      ].filter(Boolean).join(' · ');

      listings.push({
        external_id: normalizePortalSlug(projectUrl),
        title: title || `Projekt ${location.district || location.city || 'Flat Zone'}`,
        listing_kind: 'project',
        type: normalizePropertyType(title),
        status: 'aktivní',
        price: inferPrice(html),
        area_m2: inferArea(html),
        rooms: inferRooms(title, html),
        city: location.city || 'Neznámé',
        district: location.district || location.city || 'Neznámé',
        address: location.address || '',
        lat: coords.lat,
        lon: coords.lon,
        description: description || null,
        url: projectUrl,
        listed_at: asIsoString(new Date(), new Date().toISOString()),
        updated_at: asIsoString(new Date(), new Date().toISOString()),
        is_competitor: true,
        notes,
      });
    } catch (error) {
      errors.push({
        projectUrl,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    source: 'flatzone-public-web',
    seeds: discovery.seeds,
    discoveredProjects: discovery.projectUrls.length,
    listings,
    errors,
  };
}
