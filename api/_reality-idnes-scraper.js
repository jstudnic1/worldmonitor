const REALITY_IDNES_BASE_URL = 'https://reality.idnes.cz';
const REALITY_IDNES_PROJECTS_URL = `${REALITY_IDNES_BASE_URL}/projekty/`;
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MAX_PAGES = 4;
const DEFAULT_MAX_PROJECTS = 120;

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
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizePropertyType(value, fallback = 'byt') {
  const normalized = normalizeText(value);
  if (!normalized) return fallback;
  if (normalized.includes('dum')) return 'dům';
  if (normalized.includes('pozem')) return 'pozemek';
  if (normalized.includes('komerc') || normalized.includes('obchod') || normalized.includes('kancel') || normalized.includes('sklad')) {
    return 'komerční';
  }
  return 'byt';
}

function buildHeaders() {
  return {
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'accept-language': 'cs-CZ,cs;q=0.9,en;q=0.8',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    'upgrade-insecure-requests': '1',
  };
}

async function fetchHtml(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: buildHeaders(),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Reality.iDNES returned ${response.status} for ${url}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
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

function splitLocation(info) {
  const text = stripTags(info);
  const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
  const cityCandidate = parts.at(-1) || '';
  const address = parts.join(', ');

  if (!cityCandidate) {
    return {
      city: '',
      district: '',
      address,
    };
  }

  if (/^Praha(?:\s+\d+)?$/i.test(cityCandidate)) {
    return {
      city: 'Praha',
      district: cityCandidate,
      address,
    };
  }

  return {
    city: cityCandidate,
    district: cityCandidate,
    address,
  };
}

function parseListPage(html) {
  const articles = [...html.matchAll(/<article>([\s\S]*?)<\/article>/gi)];
  const listings = [];

  for (const [, articleHtml] of articles) {
    const hrefMatch = articleHtml.match(/href="([^"]*\/projekt\/[^"]+)"/i);
    const titleMatch = articleHtml.match(/<h2[^>]*class="c-products__title"[^>]*>([\s\S]*?)<\/h2>/i);
    const infoMatch = articleHtml.match(/<p[^>]*class="c-products__info"[^>]*>([\s\S]*?)<\/p>/i);
    const priceMatch = articleHtml.match(/<p[^>]*class="c-products__price"[^>]*>([\s\S]*?)<\/p>/i);
    const brandMatch = articleHtml.match(/data-brand="([^"]+)"/i);
    const imageAltMatch = articleHtml.match(/alt="([^"]+)"/i);

    const href = hrefMatch?.[1] ? new URL(decodeHtml(hrefMatch[1]), REALITY_IDNES_BASE_URL).toString() : '';
    const title = stripTags(titleMatch?.[1] || '');

    if (!href || !title) continue;

    const info = stripTags(infoMatch?.[1] || '');
    const location = splitLocation(info);
    const priceText = stripTags(priceMatch?.[1] || '');
    const detailId = href.match(/\/([a-f0-9]{24})\/?$/i)?.[1] || '';

    listings.push({
      external_id: detailId || href,
      title,
      url: href,
      city: location.city || 'Neznámé',
      district: location.district || location.city || 'Neznámé',
      address: location.address || null,
      price: /cena na vyzadani/i.test(normalizeText(priceText)) ? null : coerceNumber(priceText),
      price_text: priceText || 'Cena na vyžádání',
      description: '',
      notes: [
        'Developerský projekt',
        brandMatch?.[1] ? `Developer: ${decodeHtml(brandMatch[1]).trim()}` : '',
        imageAltMatch?.[1] ? `Listing: ${decodeHtml(imageAltMatch[1]).trim()}` : '',
        'Zdroj: Reality.iDNES veřejný web',
      ].filter(Boolean).join(' · '),
      developer: brandMatch?.[1] ? decodeHtml(brandMatch[1]).trim() : '',
      listing_kind: 'project',
      type: normalizePropertyType(`${title} ${info}`),
      status: 'aktivní',
      listed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_competitor: true,
      lat: null,
      lon: null,
    });
  }

  return listings;
}

function extractMapJson(html) {
  const match = html.match(/<script[^>]+type="application\/json"[^>]+data-maptiler-json[^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function pickProjectPoint(mapJson, detailUrl, title) {
  const features = mapJson?.geojson?.features;
  if (!Array.isArray(features)) return null;

  const detailPath = (() => {
    try {
      return new URL(detailUrl).pathname.replace(/\/+$/, '/');
    } catch {
      return '';
    }
  })();

  const points = features.filter((feature) => feature?.geometry?.type === 'Point' && Array.isArray(feature?.geometry?.coordinates));
  if (points.length === 0) return null;

  const byExactLink = points.find((feature) => {
    const link = feature?.properties?.link;
    if (!link || !detailPath) return false;
    try {
      return new URL(link).pathname.replace(/\/+$/, '/') === detailPath;
    } catch {
      return false;
    }
  });
  if (byExactLink) return byExactLink;

  const byTitle = points.find((feature) => stripTags(feature?.properties?.title || '') === title);
  if (byTitle) return byTitle;

  const nonSimilar = points.find((feature) => feature?.properties?.isSimilar !== true);
  if (nonSimilar) return nonSimilar;

  return points[0] || null;
}

function extractCoordinates(point) {
  const coords = point?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return { lat: null, lon: null };
  const [lon, lat] = coords;
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return { lat: null, lon: null };
  if (Number(lat) === 0 && Number(lon) === 0) return { lat: null, lon: null };
  return { lat: Number(lat), lon: Number(lon) };
}

async function enrichListing(listing, timeoutMs) {
  const html = await fetchHtml(listing.url, timeoutMs);
  const description = extractMeta(html, 'og:description') || extractMeta(html, 'description');
  const mapJson = extractMapJson(html);
  const point = pickProjectPoint(mapJson, listing.url, listing.title);
  const { lat, lon } = extractCoordinates(point);
  const pointAddress = stripTags(point?.properties?.address || '');
  const pointPriceText = stripTags(point?.properties?.price || '');

  return {
    ...listing,
    description: description || listing.description,
    address: pointAddress || listing.address,
    price: listing.price ?? coerceNumber(pointPriceText),
    lat: lat ?? listing.lat,
    lon: lon ?? listing.lon,
    notes: [
      listing.notes,
      lat !== null && lon !== null ? 'Souřadnice z detailu projektu' : '',
    ].filter(Boolean).join(' · '),
  };
}

function buildPageUrl(index) {
  if (index <= 0) return REALITY_IDNES_PROJECTS_URL;
  return `${REALITY_IDNES_PROJECTS_URL}?page=${index}`;
}

export async function scrapeRealityIdnesProjects() {
  const timeoutMs = toPositiveInt(process.env.REALITY_IDNES_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const maxPages = toPositiveInt(process.env.REALITY_IDNES_MAX_PAGES, DEFAULT_MAX_PAGES);
  const maxProjects = toPositiveInt(process.env.REALITY_IDNES_MAX_PROJECTS, DEFAULT_MAX_PROJECTS);
  const fetchDetails = process.env.REALITY_IDNES_FETCH_DETAILS !== '0';

  const aggregated = [];
  const errors = [];

  for (let pageIndex = 0; pageIndex < maxPages && aggregated.length < maxProjects; pageIndex += 1) {
    const pageUrl = buildPageUrl(pageIndex);
    try {
      const html = await fetchHtml(pageUrl, timeoutMs);
      const parsed = parseListPage(html);
      if (parsed.length === 0) break;

      for (const listing of parsed) {
        if (aggregated.length >= maxProjects) break;
        aggregated.push(listing);
      }
    } catch (error) {
      errors.push({
        pageUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const listing of aggregated) {
    const key = listing.external_id || listing.url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(listing);
  }

  const listings = [];
  for (const listing of deduped) {
    if (!fetchDetails) {
      listings.push(listing);
      continue;
    }

    try {
      listings.push(await enrichListing(listing, timeoutMs));
    } catch (error) {
      errors.push({
        detailUrl: listing.url,
        error: error instanceof Error ? error.message : String(error),
      });
      listings.push(listing);
    }
  }

  return {
    source: 'reality_idnes_public',
    baseUrl: REALITY_IDNES_PROJECTS_URL,
    maxPages,
    maxProjects,
    fetchDetails,
    listings,
    errors,
  };
}
