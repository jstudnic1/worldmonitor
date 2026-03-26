import { importNormalizedListings } from '../_listing-ingest.js';
import { scrapeFlatZoneProjects } from '../_flatzone-scraper.js';
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

  if (process.env.FLATZONE_SCRAPE_ENABLED !== '1') {
    return new Response(JSON.stringify({
      success: true,
      skipped: true,
      reason: 'flatzone_scrape_disabled',
      expectedEnv: ['FLATZONE_SCRAPE_ENABLED=1'],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const scrapeResult = await scrapeFlatZoneProjects();
    const syncResult = await importNormalizedListings({
      portal: 'flatzone',
      listings: scrapeResult.listings,
      createAlerts: true,
    });

    return new Response(JSON.stringify({
      success: true,
      source: scrapeResult.source,
      seeds: scrapeResult.seeds,
      discoveredProjects: scrapeResult.discoveredProjects,
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
