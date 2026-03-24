import { getCorsHeaders } from './_cors.js';
import { isConfigured, queryTable } from './_supabase.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const cors = getCorsHeaders(req, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  if (!isConfigured()) {
    return new Response(JSON.stringify({ alerts: [], source: 'demo' }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get('unread') !== 'false';
    const limit = url.searchParams.get('limit') || '30';

    const parts = ['select=id,type,title,description,severity,read,created_at'];
    if (unreadOnly) parts.push('read=eq.false');
    parts.push('order=created_at.desc');
    parts.push(`limit=${limit}`);

    const alerts = await queryTable('alerts', parts.join('&'));
    return new Response(JSON.stringify({ alerts, total: alerts.length, source: 'supabase' }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=15' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
}
