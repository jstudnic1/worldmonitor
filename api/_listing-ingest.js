import { insertRows, queryTable } from './_supabase.js';
import { formatPortalLabel, normalizePortalSlug } from './_portal-sources.js';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function readPath(source, path) {
  const parts = String(path || '').split('.').filter(Boolean);
  let current = source;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

function pickValue(source, candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const value = candidate.includes('.') ? readPath(source, candidate) : source?.[candidate];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return undefined;
}

function coerceNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

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
  if (normalized.includes('pozem')) return 'pozemek';
  if (normalized.includes('komerc') || normalized.includes('obchod') || normalized.includes('kancel') || normalized.includes('sklad')) {
    return 'komerční';
  }
  return 'byt';
}

function normalizeStatus(value) {
  const normalized = normalizeText(value);
  if (!normalized) return 'aktivní';
  if (normalized.includes('rezerv')) return 'rezervace';
  if (normalized.includes('prod') || normalized.includes('sold') || normalized.includes('closed')) return 'prodáno';
  if (normalized.includes('staz') || normalized.includes('stažen') || normalized.includes('archiv') || normalized.includes('inactive')) return 'staženo';
  return 'aktivní';
}

function inferLocation(item) {
  const cityCandidate = pickValue(item, ['city', 'locality.city', 'location.city', 'town', 'municipality']);
  const districtCandidate = pickValue(item, ['district', 'locality.district', 'location.district', 'city_part', 'borough']);
  const addressCandidate = pickValue(item, ['address', 'location.address', 'locality.address', 'full_address', 'locality']);

  let city = cityCandidate ? String(cityCandidate).trim() : '';
  let district = districtCandidate ? String(districtCandidate).trim() : '';
  const address = addressCandidate ? String(addressCandidate).trim() : '';

  if ((!city || !district) && address) {
    const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
    if (!city) city = parts[parts.length - 1] || city;
    if (!district) district = parts[0] || city || district;
  }

  if (!city && district) city = district;
  if (!district && city) district = city;

  return {
    city: city || 'Neznámé',
    district: district || city || 'Neznámé',
    address,
  };
}

function ensureStableUrl(url, fallbackBase, externalId) {
  const trimmed = String(url || '').trim();
  if (trimmed) return trimmed;
  const base = String(fallbackBase || '').replace(/#.*$/, '').trim();
  if (!base) return '';
  return `${base}${base.includes('#') ? '' : '#'}${encodeURIComponent(String(externalId || 'listing'))}`;
}

function buildNotes(item, feed, listingKind) {
  const fragments = [];
  if (listingKind === 'project') fragments.push('Developerský projekt');

  const projectName = pickValue(item, ['project_name', 'projectName', 'development_name', 'developmentName']);
  if (projectName) fragments.push(`Projekt: ${String(projectName).trim()}`);

  const developer = pickValue(item, ['developer_name', 'developerName', 'developer']);
  if (developer) fragments.push(`Developer: ${String(developer).trim()}`);

  const handoverAt = pickValue(item, ['handover_at', 'completion_at', 'completion_date', 'move_in_at']);
  if (handoverAt) fragments.push(`Dokončení: ${String(handoverAt).trim()}`);

  if (feed.label) fragments.push(`Zdroj: ${feed.label}`);

  return fragments.join(' · ');
}

function extractArray(payload, arrayPath) {
  if (Array.isArray(payload)) return payload;

  if (arrayPath) {
    const value = readPath(payload, arrayPath);
    if (Array.isArray(value)) return value;
  }

  const candidates = ['items', 'listings', 'projects', 'results', 'data', '_embedded.estates'];
  for (const candidate of candidates) {
    const value = readPath(payload, candidate);
    if (Array.isArray(value)) return value;
  }

  return [];
}

export function normalizeExternalFeedPayload(payload, feed) {
  const nowIso = new Date().toISOString();
  const rows = extractArray(payload, feed.arrayPath);

  return rows
    .map((item, index) => {
      const rawTitle = pickValue(item, ['title', 'name', 'headline', 'project_name', 'projectName']);
      const externalId = pickValue(item, ['external_id', 'externalId', 'id', 'project_id', 'projectId', 'slug'])
        || `${feed.portal}-${index + 1}`;
      const listingKind = normalizeText(pickValue(item, ['listing_kind', 'listingKind', 'kind'])) === 'project'
        ? 'project'
        : feed.listingKind || 'listing';

      const { city, district, address } = inferLocation(item);
      const title = rawTitle
        ? String(rawTitle).trim()
        : (listingKind === 'project' ? `Projekt ${district || city}` : `Nabídka ${district || city}`);
      const price = coerceNumber(pickValue(item, ['price', 'price_from', 'min_price', 'asking_price', 'amount']));
      const area = coerceNumber(pickValue(item, ['area_m2', 'area', 'size_m2', 'usable_area', 'living_area']));
      const url = ensureStableUrl(
        pickValue(item, ['url', 'detail_url', 'detailUrl', 'source_url', 'sourceUrl', 'project_url', 'projectUrl', 'link', 'permalink']),
        feed.url,
        externalId,
      );

      return {
        external_id: String(externalId),
        title,
        listing_kind: listingKind,
        type: normalizePropertyType(pickValue(item, ['type', 'property_type', 'propertyType', 'category', 'asset_type']), feed.defaultType || 'byt'),
        status: normalizeStatus(pickValue(item, ['status', 'state', 'sale_state', 'availability'])),
        price,
        area_m2: area,
        rooms: pickValue(item, ['rooms', 'layout', 'disposition']) ? String(pickValue(item, ['rooms', 'layout', 'disposition'])).trim() : null,
        city,
        district,
        address,
        lat: coerceNumber(pickValue(item, ['lat', 'latitude', 'location.lat'])),
        lon: coerceNumber(pickValue(item, ['lon', 'lng', 'longitude', 'location.lon', 'location.lng'])),
        description: pickValue(item, ['description', 'summary', 'teaser']) ? String(pickValue(item, ['description', 'summary', 'teaser'])).trim() : null,
        url,
        listed_at: asIsoString(pickValue(item, ['listed_at', 'published_at', 'created_at', 'createdAt', 'first_seen_at']), nowIso),
        updated_at: asIsoString(pickValue(item, ['updated_at', 'modified_at', 'modifiedAt', 'last_seen_at']), nowIso),
        is_competitor: feed.isCompetitor !== false,
        notes: buildNotes(item, feed, listingKind),
      };
    })
    .filter((listing) => Boolean(listing.title && listing.url && listing.external_id));
}

function dedupeNormalizedListings(listings) {
  const seen = new Set();
  return listings.filter((listing) => {
    const key = listing.external_id || listing.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mapListingToPortalRow(portal, listing) {
  return {
    portal,
    external_id: listing.external_id,
    title: listing.title,
    price: listing.price,
    city: listing.city,
    district: listing.district,
    url: listing.url,
    first_seen_at: listing.listed_at,
    last_seen_at: listing.updated_at || listing.listed_at,
    is_competitor: listing.is_competitor !== false,
    notes: listing.notes || null,
  };
}

function mapListingToPropertyRow(portal, listing) {
  const area = Number(listing.area_m2 || 0);
  const price = Number(listing.price || 0);
  const rawLat = Number(listing.lat);
  const rawLon = Number(listing.lon);
  const hasValidCoordinates = Number.isFinite(rawLat)
    && Number.isFinite(rawLon)
    && !(rawLat === 0 && rawLon === 0);

  return {
    title: listing.title,
    type: listing.type || 'byt',
    status: listing.status || 'aktivní',
    price,
    price_per_m2: area > 0 && price > 0 ? Math.round(price / area) : null,
    area_m2: area > 0 ? area : 1,
    rooms: listing.rooms || null,
    city: listing.city || 'Neznámé',
    district: listing.district || listing.city || 'Neznámé',
    address: listing.address || null,
    lat: hasValidCoordinates ? rawLat : null,
    lon: hasValidCoordinates ? rawLon : null,
    description: listing.description || null,
    source: portal,
    source_url: listing.url,
    listed_at: listing.listed_at,
    updated_at: listing.updated_at || listing.listed_at,
    notes: listing.notes || null,
  };
}

function buildPropertyFingerprint(row) {
  const title = normalizeText(row?.title);
  const city = normalizeText(row?.city);
  const district = normalizeText(row?.district);
  const price = Number(row?.price || 0);

  if (!title || !city || price <= 0) return '';
  return [title, city, district, price].join('|');
}

function formatPriceCs(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 'Cena na dotaz';
  return `${amount.toLocaleString('cs-CZ')} Kč`;
}

export async function importNormalizedListings({
  portal,
  listings,
  createAlerts = true,
}) {
  const normalizedPortal = normalizePortalSlug(portal);
  const cleanListings = dedupeNormalizedListings(listings);
  const portalFilter = encodeURIComponent(normalizedPortal);

  const [existingPortalRows, existingProperties] = await Promise.all([
    queryTable('portal_listings', `select=external_id,url&portal=eq.${portalFilter}`),
    queryTable('properties', `select=source_url,title,city,district,price&source=eq.${portalFilter}`),
  ]);

  const existingPortalKeys = new Set();
  for (const row of existingPortalRows) {
    if (row.external_id) existingPortalKeys.add(`id:${row.external_id}`);
    if (row.url) existingPortalKeys.add(`url:${row.url}`);
  }
  const existingPropertyUrls = new Set(existingProperties.map((row) => row.source_url).filter(Boolean));
  const existingPropertyFingerprints = new Set(
    existingProperties
      .map((row) => buildPropertyFingerprint(row))
      .filter(Boolean),
  );

  const newPortalListings = [];
  const newPropertyRows = [];
  const alertCandidates = [];

  for (const listing of cleanListings) {
    const portalKey = listing.external_id ? `id:${listing.external_id}` : `url:${listing.url}`;
    const urlKey = listing.url ? `url:${listing.url}` : '';
    const isExistingPortal = existingPortalKeys.has(portalKey) || (urlKey ? existingPortalKeys.has(urlKey) : false);
    if (!isExistingPortal) {
      newPortalListings.push(mapListingToPortalRow(normalizedPortal, listing));
      alertCandidates.push(listing);
      if (portalKey) existingPortalKeys.add(portalKey);
      if (urlKey) existingPortalKeys.add(urlKey);
    }

    const canCreateProperty = Boolean(
      listing.url
      && listing.title
      && listing.city
      && listing.district
      && Number(listing.price || 0) > 0,
    );
    const propertyFingerprint = buildPropertyFingerprint(listing);
    if (
      canCreateProperty
      && !existingPropertyUrls.has(listing.url)
      && !(propertyFingerprint && existingPropertyFingerprints.has(propertyFingerprint))
    ) {
      newPropertyRows.push(mapListingToPropertyRow(normalizedPortal, listing));
      existingPropertyUrls.add(listing.url);
      if (propertyFingerprint) existingPropertyFingerprints.add(propertyFingerprint);
    }
  }

  if (newPortalListings.length > 0) {
    await insertRows('portal_listings', newPortalListings);
  }

  if (newPropertyRows.length > 0) {
    await insertRows('properties', newPropertyRows);
  }

  let alertsCreated = 0;
  if (createAlerts && alertCandidates.length > 0) {
    const alerts = alertCandidates.slice(0, 5).map((listing) => {
      const isProject = listing.listing_kind === 'project';
      return {
        type: isProject ? 'portal_update' : 'new_listing',
        title: `${isProject ? 'Nový projekt' : 'Nová nabídka'}: ${listing.title}`,
        description: `${listing.city}, ${listing.district} — ${formatPriceCs(listing.price)} · ${formatPortalLabel(normalizedPortal)}`,
        severity: 'medium',
      };
    });
    if (alerts.length > 0) {
      await insertRows('alerts', alerts);
      alertsCreated = alerts.length;
    }
  }

  return {
    portal: normalizedPortal,
    portalLabel: formatPortalLabel(normalizedPortal),
    fetched: cleanListings.length,
    insertedPortalListings: newPortalListings.length,
    insertedProperties: newPropertyRows.length,
    alertsCreated,
  };
}
