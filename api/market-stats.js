import { getCorsHeaders } from './_cors.js';
import { isConfigured, queryTable } from './_supabase.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const cors = getCorsHeaders(req, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  if (!isConfigured()) {
    return new Response(JSON.stringify({ stats: null, source: 'demo' }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Fetch all active properties
    const properties = await queryTable('properties',
      'select=city,type,price,price_per_m2,area_m2,status,source,listed_at&status=eq.aktivní'
    );

    // Compute stats by city
    const byCity = {};
    for (const p of properties) {
      const key = p.city || 'Neznámé';
      if (!byCity[key]) byCity[key] = { count: 0, prices: [], pricesM2: [], areas: [] };
      byCity[key].count++;
      byCity[key].prices.push(Number(p.price) || 0);
      if (p.price_per_m2) byCity[key].pricesM2.push(Number(p.price_per_m2));
      byCity[key].areas.push(Number(p.area_m2) || 0);
    }

    const cityStats = Object.entries(byCity)
      .map(([city, s]) => ({
        city,
        count: s.count,
        avg_price: Math.round(s.prices.reduce((a, b) => a + b, 0) / s.count),
        median_price: median(s.prices),
        avg_price_per_m2: s.pricesM2.length > 0 ? Math.round(s.pricesM2.reduce((a, b) => a + b, 0) / s.pricesM2.length) : null,
        avg_area_m2: Math.round(s.areas.reduce((a, b) => a + b, 0) / s.count),
        min_price: Math.min(...s.prices),
        max_price: Math.max(...s.prices),
      }))
      .sort((a, b) => b.count - a.count);

    // By type
    const byType = {};
    for (const p of properties) {
      const key = p.type || 'neznámý';
      if (!byType[key]) byType[key] = { count: 0, totalPrice: 0 };
      byType[key].count++;
      byType[key].totalPrice += Number(p.price) || 0;
    }
    const typeStats = Object.entries(byType).map(([type, s]) => ({
      type,
      count: s.count,
      avg_price: Math.round(s.totalPrice / s.count),
    }));

    // By source
    const bySource = {};
    for (const p of properties) {
      const key = p.source || 'unknown';
      bySource[key] = (bySource[key] || 0) + 1;
    }

    return new Response(JSON.stringify({
      total_active: properties.length,
      by_city: cityStats,
      by_type: typeStats,
      by_source: bySource,
      source: 'supabase',
    }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
}

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}
