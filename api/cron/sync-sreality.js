// Vercel Cron: Sync listings from Sreality.cz API into Supabase
// Schedule: daily morning refresh (configured in vercel.json)

import { isConfigured, insertRows, queryTable } from '../_supabase.js';

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

/**
 * Convert a Sreality estate to our property format
 */
function mapSrealityToProperty(estate, type) {
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
      const areaMatch = label.match(/(\d+)\s*m²/);
      if (areaMatch) {
        areaSqm = parseInt(areaMatch[1], 10);
        break;
      }
    }
  }
  // Fallback: check name for area
  if (!areaSqm) {
    const nameAreaMatch = name.match(/(\d+)\s*m²/);
    if (nameAreaMatch) areaSqm = parseInt(nameAreaMatch[1], 10);
  }

  const pricePerM2 = areaSqm > 0 ? Math.round(price / areaSqm) : null;
  const rooms = extractRooms(name);

  return {
    title: name,
    type,
    status: 'aktivní',
    price,
    price_per_m2: pricePerM2,
    area_m2: areaSqm || 1,
    rooms,
    city,
    district,
    address: locality,
    lat: gps.lat || null,
    lon: gps.lon || null,
    description: null, // detail endpoint needed for full description
    source: 'sreality',
    source_url: estate.seo?.href ? `https://www.sreality.cz${estate.seo.href}` : null,
    listed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function mapSrealityToPortalListing(estate) {
  const locality = estate.locality || '';
  const localityParts = locality.split(',').map(s => s.trim()).filter(Boolean);
  const city = localityParts[localityParts.length - 1] || 'Unknown';
  const district = localityParts[0] || city;
  const sourceUrl = estate.seo?.href ? `https://www.sreality.cz${estate.seo.href}` : null;

  return {
    portal: 'sreality',
    external_id: estate.hash_id ? String(estate.hash_id) : (sourceUrl || estate.name || `sreality-${Date.now()}`),
    title: estate.name || 'Bez názvu',
    price: estate.price || null,
    city,
    district,
    url: sourceUrl,
    first_seen_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
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
    // Get existing source_urls to avoid duplicates in properties
    const existingProperties = await queryTable(
      'properties',
      'select=source_url&source=eq.sreality&source_url=not.is.null'
    );
    const existingPropertyUrls = new Set(existingProperties.map(p => p.source_url));
    const existingPortalRows = await queryTable(
      'portal_listings',
      'select=url&portal=eq.sreality&url=not.is.null'
    );
    const existingPortalUrls = new Set(existingPortalRows.map(p => p.url));

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

          // Map and filter new listings
          const newProperties = estates
            .map(e => mapSrealityToProperty(e, cat.type))
            .filter(p => p.price > 0)
            .filter(p => !p.source_url || !existingPropertyUrls.has(p.source_url));

          const newPortalListings = estates
            .map(e => mapSrealityToPortalListing(e))
            .filter(listing => listing.url)
            .filter(listing => !existingPortalUrls.has(listing.url));

          if (newProperties.length > 0) {
            await insertRows('properties', newProperties);
            results.inserted += newProperties.length;
            newProperties.forEach(property => {
              if (property.source_url) existingPropertyUrls.add(property.source_url);
            });

            // Also create alerts for new listings
            const alerts = newProperties.slice(0, 5).map(p => ({
              type: 'new_listing',
              title: `Nová nabídka: ${p.title}`,
              description: `${p.city}, ${p.district} — ${p.price.toLocaleString('cs-CZ')} Kč, ${p.area_m2} m²`,
              severity: 'medium',
            }));
            await insertRows('alerts', alerts);
          }

          if (newPortalListings.length > 0) {
            await insertRows('portal_listings', newPortalListings);
            newPortalListings.forEach(listing => existingPortalUrls.add(listing.url));
          }
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
