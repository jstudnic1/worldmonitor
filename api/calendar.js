import { getCorsHeaders } from './_cors.js';
import { isConfigured, queryTable } from './_supabase.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const cors = getCorsHeaders(req, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  if (!isConfigured()) {
    return new Response(JSON.stringify({ events: [], source: 'demo' }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = new URL(req.url);
    const days = url.searchParams.get('days') || '14';
    const limit = url.searchParams.get('limit') || '50';

    // Include events from 3 days ago (so calendar isn't empty) to N days ahead
    const pastDate = new Date(Date.now() - 3 * 86400000).toISOString();
    const futureDate = new Date(Date.now() + Number(days) * 86400000).toISOString();

    const rawEvents = await queryTable('calendar_events',
      `select=id,title,type,start_at,location,notes&start_at=gte.${pastDate}&start_at=lte.${futureDate}&order=start_at.asc&limit=${limit}`
    );

    // Transform start_at into date + time for the frontend
    const events = rawEvents.map((e) => {
      const dt = new Date(e.start_at);
      const hh = String(dt.getUTCHours()).padStart(2, '0');
      const mm = String(dt.getUTCMinutes()).padStart(2, '0');
      return {
        id: e.id,
        title: e.title,
        type: e.type,
        date: dt.toISOString().split('T')[0],
        time: `${hh}:${mm}`,
        location: e.location || undefined,
        notes: e.notes || undefined,
      };
    });

    return new Response(JSON.stringify({ events, total: events.length, source: 'supabase' }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=30' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
}
