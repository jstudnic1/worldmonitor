import { getCorsHeaders } from './_cors.js';
import { isConfigured, queryTable } from './_supabase.js';

export const config = { runtime: 'edge' };

// Fallback demo data when Supabase is not configured
const DEMO_PROPERTIES = [
  { id: '1', title: 'Byt 3+kk, Vinohrady', type: 'byt', price: 8950000, price_per_m2: 119333, area_m2: 75, rooms: '3+kk', city: 'Praha', district: 'Vinohrady', status: 'aktivní', listed_at: '2026-03-20', lat: 50.0755, lon: 14.4378, source: 'internal' },
  { id: '2', title: 'Byt 2+1, Smíchov', type: 'byt', price: 6200000, price_per_m2: 103333, area_m2: 60, rooms: '2+1', city: 'Praha', district: 'Smíchov', status: 'aktivní', listed_at: '2026-03-19', lat: 50.0694, lon: 14.4031, source: 'internal' },
  { id: '3', title: 'Rodinný dům, Černošice', type: 'dům', price: 12500000, price_per_m2: 78125, area_m2: 160, rooms: '5+1', city: 'Černošice', district: 'Praha-západ', status: 'rezervace', listed_at: '2026-03-18', lat: 49.9614, lon: 14.3192, source: 'internal' },
  { id: '4', title: 'Byt 1+kk, Karlín', type: 'byt', price: 4800000, price_per_m2: 133333, area_m2: 36, rooms: '1+kk', city: 'Praha', district: 'Karlín', status: 'aktivní', listed_at: '2026-03-21', lat: 50.0922, lon: 14.4507, source: 'internal' },
  { id: '5', title: 'Byt 4+kk, Dejvice', type: 'byt', price: 15200000, price_per_m2: 126667, area_m2: 120, rooms: '4+kk', city: 'Praha', district: 'Dejvice', status: 'aktivní', listed_at: '2026-03-17', lat: 50.1001, lon: 14.3900, source: 'internal' },
  { id: '6', title: 'Komerční prostor, Centrum', type: 'komerční', price: 22000000, price_per_m2: 91667, area_m2: 240, rooms: '-', city: 'Praha', district: 'Praha 1', status: 'aktivní', listed_at: '2026-03-16', lat: 50.0833, lon: 14.4167, source: 'internal' },
  { id: '7', title: 'Byt 2+kk, Brno-střed', type: 'byt', price: 4200000, price_per_m2: 84000, area_m2: 50, rooms: '2+kk', city: 'Brno', district: 'Brno-střed', status: 'aktivní', listed_at: '2026-03-21', lat: 49.1951, lon: 16.6068, source: 'internal' },
  { id: '8', title: 'Pozemek, Říčany', type: 'pozemek', price: 3600000, price_per_m2: 4500, area_m2: 800, rooms: '-', city: 'Říčany', district: 'Praha-východ', status: 'aktivní', listed_at: '2026-03-15', lat: 49.9908, lon: 14.6539, source: 'internal' },
];

function hasPresentablePrice(property) {
  return Number(property?.price || 0) > 1;
}

export default async function handler(req) {
  const cors = getCorsHeaders(req, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const url = new URL(req.url);
  const city = url.searchParams.get('city');
  const type = url.searchParams.get('type');
  const minPrice = url.searchParams.get('minPrice');
  const maxPrice = url.searchParams.get('maxPrice');
  const status = url.searchParams.get('status') || 'aktivní';
  const limit = url.searchParams.get('limit') || '50';
  const source = url.searchParams.get('source'); // 'sreality', 'internal', etc.

  // Try Supabase first, fall back to demo data
  if (isConfigured()) {
    try {
      const parts = ['select=id,title,type,status,price,price_per_m2,area_m2,rooms,city,district,address,lat,lon,source,source_url,listed_at'];
      if (city) parts.push(`city=ilike.*${city}*`);

      // Tab-based filtering: sale = all active for sale, rent = pronájem, new = last 7 days
      if (type === 'rent') {
        parts.push('title=ilike.*pronájem*');
      } else if (type === 'new') {
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        parts.push(`listed_at=gte.${weekAgo}`);
      } else if (type && type !== 'sale') {
        // Direct type filter (byt, dům, komerční, pozemek)
        parts.push(`type=eq.${type}`);
      }
      // 'sale' or no type: return all active listings

      if (status) parts.push(`status=eq.${status}`);
      parts.push('price=gt.1');
      if (minPrice) parts.push(`price=gte.${minPrice}`);
      if (maxPrice) parts.push(`price=lte.${maxPrice}`);
      if (source) parts.push(`source=eq.${source}`);
      parts.push('order=listed_at.desc');
      parts.push(`limit=${limit}`);

      const properties = (await queryTable('properties', parts.join('&'))).filter(hasPresentablePrice);

      return new Response(JSON.stringify({ properties, total: properties.length, source: 'supabase' }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=30' },
      });
    } catch (err) {
      // Fall through to demo data
      console.error('Supabase query failed:', err.message);
    }
  }

  // Fallback: demo data
  let filtered = DEMO_PROPERTIES.filter(hasPresentablePrice);
  if (city) filtered = filtered.filter(p => p.city.toLowerCase().includes(city.toLowerCase()));
  if (minPrice) filtered = filtered.filter(p => p.price >= Number(minPrice));
  if (maxPrice) filtered = filtered.filter(p => p.price <= Number(maxPrice));
  if (source) filtered = filtered.filter(p => p.source === source);

  return new Response(JSON.stringify({ properties: filtered, total: filtered.length, source: 'demo' }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60' },
  });
}
