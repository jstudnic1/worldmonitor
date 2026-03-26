import { getCorsHeaders } from './_cors.js';
import { isConfigured } from './_supabase.js';
import { fetchRealityMarketStats } from './_market-stats.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const cors = getCorsHeaders(req, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const url = new URL(req.url);
  const source = url.searchParams.get('source') || '';
  const city = url.searchParams.get('city') || '';

  if (!isConfigured()) {
    return new Response(JSON.stringify({ stats: null, source: 'demo' }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    const stats = await fetchRealityMarketStats({ source, city, type: 'byt' });

    return new Response(JSON.stringify({
      ...stats,
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
