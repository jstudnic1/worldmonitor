// Vercel Cron: Sync normalized external listing/project feeds into Supabase.
// Intended for partner feeds such as Flat Zone Studio exports.

import { getExternalFeedsExample, getConfiguredExternalFeeds } from '../_portal-sources.js';
import { importNormalizedListings, normalizeExternalFeedPayload } from '../_listing-ingest.js';
import { isConfigured } from '../_supabase.js';

export const config = { runtime: 'nodejs', maxDuration: 60 };

async function fetchJson(url, headers = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'RealityMonitor/1.0',
        ...headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${await response.text()}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

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

  const feeds = getConfiguredExternalFeeds();
  if (feeds.length === 0) {
    return new Response(JSON.stringify({
      success: true,
      skipped: true,
      reason: 'no_external_feeds_configured',
      expectedEnv: ['REALITY_EXTERNAL_FEEDS', 'FLATZONE_FEED_URL'],
      example: getExternalFeedsExample(),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const results = {
    success: true,
    processedFeeds: 0,
    totals: {
      fetched: 0,
      insertedPortalListings: 0,
      insertedProperties: 0,
      alertsCreated: 0,
    },
    feeds: [],
    errors: [],
    timestamp: new Date().toISOString(),
  };

  for (const feed of feeds) {
    try {
      const payload = await fetchJson(feed.url, feed.headers, feed.timeoutMs);
      const listings = normalizeExternalFeedPayload(payload, feed);
      const syncResult = await importNormalizedListings({
        portal: feed.portal,
        listings,
        createAlerts: feed.createAlerts !== false,
      });

      results.processedFeeds += 1;
      results.totals.fetched += syncResult.fetched;
      results.totals.insertedPortalListings += syncResult.insertedPortalListings;
      results.totals.insertedProperties += syncResult.insertedProperties;
      results.totals.alertsCreated += syncResult.alertsCreated;
      results.feeds.push({
        portal: feed.portal,
        label: feed.label,
        listingKind: feed.listingKind,
        fetched: syncResult.fetched,
        insertedPortalListings: syncResult.insertedPortalListings,
        insertedProperties: syncResult.insertedProperties,
        alertsCreated: syncResult.alertsCreated,
      });
    } catch (error) {
      results.errors.push({
        portal: feed.portal,
        label: feed.label,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return new Response(JSON.stringify(results), {
    status: results.errors.length > 0 && results.processedFeeds === 0 ? 500 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
