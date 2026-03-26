import { importNormalizedListings } from '../_listing-ingest.js';
import { scrapeRealityIdnesProjects } from '../_reality-idnes-scraper.js';
import { isConfigured } from '../_supabase.js';

export const config = { runtime: 'nodejs', maxDuration: 60 };

export default async function handler(req) {
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

  if (process.env.REALITY_IDNES_SCRAPE_ENABLED !== '1') {
    return new Response(JSON.stringify({
      success: true,
      skipped: true,
      reason: 'reality_idnes_scrape_disabled',
      expectedEnv: ['REALITY_IDNES_SCRAPE_ENABLED=1'],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const scrapeResult = await scrapeRealityIdnesProjects();
    const syncResult = await importNormalizedListings({
      portal: 'reality_idnes',
      listings: scrapeResult.listings,
      createAlerts: true,
    });

    return new Response(JSON.stringify({
      success: true,
      source: scrapeResult.source,
      maxPages: scrapeResult.maxPages,
      maxProjects: scrapeResult.maxProjects,
      fetchDetails: scrapeResult.fetchDetails,
      fetchedListings: scrapeResult.listings.length,
      imported: syncResult,
      errors: scrapeResult.errors,
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
