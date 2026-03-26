import { queryTable } from './_supabase.js';

const MIN_PRICE = 500000;
const MAX_PRICE = 50000000;
const MIN_AREA_M2 = 18;
const MAX_AREA_M2 = 250;
const MIN_PRICE_PER_M2 = 15000;
const MAX_PRICE_PER_M2 = 250000;
const DEFAULT_LIMIT = 5000;
const MIN_CITY_SAMPLE = 5;

export const OFFICIAL_REFERENCE_URLS = [
  'https://apl2.czso.cz/iSMS/ukazdet.jsp?fid=6650',
  'https://apl2.czso.cz/iSMS/ukazdet.jsp?fid=6916',
  'https://apl2.czso.cz/iSMS/ukazdet.jsp?fid=6920',
  'https://apl2.czso.cz/iSMS/ukazdet.jsp?fid=6934',
  'https://apl2.czso.cz/iSMS/ukazdet.jsp?fid=6938',
];

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : Math.round(sorted[mid]);
}

function quantile(values, q) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q)));
  return Math.round(sorted[index]);
}

function normalizeMarketCity(property) {
  const city = String(property.city || '').trim();
  const district = String(property.district || '').trim();
  const haystack = `${city} ${district}`.toLowerCase();

  if (haystack.includes('praha')) return 'Praha';
  if (haystack.includes('brno')) return 'Brno';
  if (haystack.includes('ostrava')) return 'Ostrava';

  const baseCity = city || district || 'Neznámé';
  if (baseCity.toLowerCase().startsWith('okres ')) {
    return baseCity.replace(/^okres\s+/i, '').trim();
  }

  return baseCity.split(' - ')[0].trim() || 'Neznámé';
}

function enrichProperty(property) {
  const price = toNumber(property.price);
  const area = toNumber(property.area_m2);
  const pricePerM2 = toNumber(property.price_per_m2) || (price > 0 && area > 0 ? Math.round(price / area) : 0);

  return {
    ...property,
    price,
    area_m2: area,
    price_per_m2: pricePerM2,
    normalized_city: normalizeMarketCity(property),
  };
}

function getRejectionReason(property) {
  if (property.price < MIN_PRICE) return 'too_cheap';
  if (property.price > MAX_PRICE) return 'too_expensive';
  if (property.area_m2 < MIN_AREA_M2) return 'too_small';
  if (property.area_m2 > MAX_AREA_M2) return 'too_large';
  if (property.price_per_m2 < MIN_PRICE_PER_M2) return 'ppm2_too_low';
  if (property.price_per_m2 > MAX_PRICE_PER_M2) return 'ppm2_too_high';
  return null;
}

function countBySource(properties) {
  const result = {};
  for (const property of properties) {
    const key = property.source || 'unknown';
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

export function computeRealityMarketStats(rawProperties) {
  const enriched = rawProperties.map(enrichProperty);
  const cleaned = [];
  const rejectionBreakdown = {};

  for (const property of enriched) {
    const reason = getRejectionReason(property);
    if (reason) {
      rejectionBreakdown[reason] = (rejectionBreakdown[reason] || 0) + 1;
      continue;
    }
    cleaned.push(property);
  }

  const byCity = {};
  for (const property of cleaned) {
    const key = property.normalized_city;
    if (!byCity[key]) {
      byCity[key] = {
        count: 0,
        prices: [],
        pricesPerM2: [],
      };
    }
    byCity[key].count += 1;
    byCity[key].prices.push(property.price);
    byCity[key].pricesPerM2.push(property.price_per_m2);
  }

  const cityStats = Object.entries(byCity)
    .map(([city, entry]) => ({
      city,
      count: entry.count,
      median_price: median(entry.prices),
      median_price_per_m2: median(entry.pricesPerM2),
      p10_price_per_m2: quantile(entry.pricesPerM2, 0.1),
      p90_price_per_m2: quantile(entry.pricesPerM2, 0.9),
    }))
    .filter((entry) => entry.count >= MIN_CITY_SAMPLE && entry.median_price_per_m2 != null)
    .sort((a, b) => b.count - a.count);

  return {
    total_active: enriched.length,
    sample_size: cleaned.length,
    excluded_count: enriched.length - cleaned.length,
    rejection_breakdown: rejectionBreakdown,
    by_city: cityStats,
    by_source: countBySource(cleaned),
    scope: 'active_flat_offers',
    methodology: 'clean_offer_flats_median',
    official_reference_urls: OFFICIAL_REFERENCE_URLS,
  };
}

export async function fetchRealityMarketStats(options = {}) {
  const parts = [
    'select=city,district,type,price,price_per_m2,area_m2,status,source',
    'status=eq.aktivní',
    `limit=${options.limit || DEFAULT_LIMIT}`,
  ];

  const propertyType = options.type || 'byt';
  if (propertyType) parts.push(`type=eq.${propertyType}`);
  if (options.city) parts.push(`city=ilike.*${options.city}*`);
  if (options.source) parts.push(`source=eq.${options.source}`);

  const properties = await queryTable('properties', parts.join('&'));
  return computeRealityMarketStats(properties);
}
