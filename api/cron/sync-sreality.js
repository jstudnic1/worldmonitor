// Vercel Cron: Sync listings from Sreality.cz API into Supabase
// Schedule: daily morning refresh (configured in vercel.json)

import { importNormalizedListings } from '../_listing-ingest.js';
import { isConfigured } from '../_supabase.js';

export const config = { runtime: 'edge', maxDuration: 60 };

const SREALITY_API = 'https://www.sreality.cz/api/cs/v2/estates';

// Category mappings
const CATEGORIES = [
  { category_main_cb: 1, category_type_cb: 1, type: 'byt', label: 'Byty prodej' },
  { category_main_cb: 2, category_type_cb: 1, type: 'dům', label: 'Domy prodej' },
  { category_main_cb: 3, category_type_cb: 1, type: 'pozemek', label: 'Pozemky prodej' },
  { category_main_cb: 4, category_type_cb: 1, type: 'komerční', label: 'Komerční prodej' },
];

// Czech regions to fetch
const REGIONS = [
  { id: 10, name: 'Praha' },
  { id: 11, name: 'Středočeský' },
  { id: 12, name: 'Jihomoravský' },
];

/**
 * Fetch a page of listings from Sreality API
 */
async function fetchSrealityPage(categoryMain, categoryType, regionId, page = 1, perPage = 60) {
  const params = new URLSearchParams({
    category_main_cb: String(categoryMain),
    category_type_cb: String(categoryType),
    locality_region_id: String(regionId),
    per_page: String(perPage),
    page: String(page),
    tms: String(Date.now()),
  });

  const res = await fetch(`${SREALITY_API}?${params}`, {
    headers: {
      'User-Agent': 'RealityMonitor/1.0',
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Sreality API ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

/**
 * Extract room layout from Sreality name field
 */
function extractRooms(name) {
  const match = name?.match(/(\d\+(?:kk|1|2|3))/i);
  return match ? match[1] : null;
}

function parseAreaSqm(value) {
  const text = String(value || '');
  const match = text.match(/(\d[\d\s.,]*)\s*m²/i);
  if (!match?.[1]) return 0;

  const normalized = match[1]
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, '')
    .replace(',', '.');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function buildSrealityUrl(estate) {
  if (estate?.seo?.href) {
    return `https://www.sreality.cz${estate.seo.href}`;
  }

  if (estate?._links?.self?.href) {
    const href = String(estate._links.self.href).trim();
    if (!href) return null;
    return href.startsWith('http') ? href : `https://www.sreality.cz/api${href}`;
  }

  if (estate?.hash_id) {
    return `https://www.sreality.cz/api/cs/v2/estates/${estate.hash_id}`;
  }

  return null;
}

function mapSrealityEstate(estate, type) {
  const gps = estate.gps || {};
  const price = estate.price || 0;
  const name = estate.name || '';
  const locality = estate.locality || '';

  // Parse city and district from locality
  const localityParts = locality.split(',').map(s => s.trim());
  const city = localityParts[localityParts.length - 1] || 'Unknown';
  const district = localityParts[0] || city;

  // Extract area from labels
  let areaSqm = 0;
  if (estate.labels) {
    for (const label of estate.labels) {
      areaSqm = parseAreaSqm(label);
      if (areaSqm) {
        break;
      }
    }
  }
  // Fallback: check name for area
  if (!areaSqm) {
    areaSqm = parseAreaSqm(name);
  }

  const pricePerM2 = areaSqm > 0 ? Math.round(price / areaSqm) : null;
  const rooms = extractRooms(name);

  return {
    external_id: estate.hash_id ? String(estate.hash_id) : (estate.seo?.href || estate.name || `sreality-${Date.now()}`),
    title: name,
    listing_kind: 'listing',
    type,
    status: 'aktivní',
    price,
    price_per_m2: pricePerM2,
    area_m2: areaSqm || null,
    rooms,
    city,
    district,
    address: locality,
    lat: gps.lat || null,
    lon: gps.lon || null,
    description: null, // detail endpoint needed for full description
    url: buildSrealityUrl(estate),
    listed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_competitor: true,
    notes: locality || null,
  };
}

export default async function handler(req) {
  // Verify cron secret (Vercel sends this header)
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isConfigured()) {
    return new Response(JSON.stringify({ error: 'Supabase not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const results = { fetched: 0, inserted: 0, errors: [] };

  try {
    for (const cat of CATEGORIES) {
      for (const region of REGIONS) {
        try {
          const data = await fetchSrealityPage(
            cat.category_main_cb,
            cat.category_type_cb,
            region.id,
            1,
            60
          );

          const estates = data._embedded?.estates || [];
          results.fetched += estates.length;

          const syncResult = await importNormalizedListings({
            portal: 'sreality',
            listings: estates
              .map((estate) => mapSrealityEstate(estate, cat.type))
              .filter((listing) => Number(listing.price || 0) > 0),
          });

          results.inserted += syncResult.insertedProperties;
        } catch (err) {
          results.errors.push(`${cat.label} ${region.name}: ${err.message}`);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      ...results,
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err.message,
      ...results,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
