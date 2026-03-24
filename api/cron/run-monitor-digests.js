import { insertRows, isConfigured, queryTable, updateRows } from '../_supabase.js';

export const config = { runtime: 'edge', maxDuration: 60 };

const DEFAULT_TIMEZONE = 'Europe/Prague';
const DEFAULT_LOOKBACK_HOURS = 30;
const MAX_DIGEST_LISTINGS = 12;
const MAX_EMAIL_LISTINGS = 6;

const DEMO_PORTAL_LISTINGS = [
  {
    id: 'portal-demo-1',
    portal: 'sreality',
    title: 'Byt 2+kk, Holešovice',
    price: 6480000,
    city: 'Praha',
    district: 'Holešovice',
    url: 'https://www.sreality.cz/detail/prodej/byt/holesovice-demo-1',
    first_seen_at: '2026-03-23T05:45:00.000Z',
    last_seen_at: '2026-03-23T05:45:00.000Z',
    is_competitor: true,
    notes: 'Praha Holešovice',
  },
  {
    id: 'portal-demo-2',
    portal: 'bezrealitky',
    title: 'Byt 3+kk, Holešovice',
    price: 8990000,
    city: 'Praha',
    district: 'Holešovice',
    url: 'https://www.bezrealitky.cz/nemovitosti-byty-domy/demo-holesovice-2',
    first_seen_at: '2026-03-23T05:20:00.000Z',
    last_seen_at: '2026-03-23T05:20:00.000Z',
    is_competitor: true,
    notes: 'Praha 7',
  },
  {
    id: 'portal-demo-3',
    portal: 'reality_idnes',
    title: 'Ateliér 1+kk, Holešovice',
    price: 4720000,
    city: 'Praha',
    district: 'Holešovice',
    url: 'https://reality.idnes.cz/detail/demo-holesovice-3',
    first_seen_at: '2026-03-23T04:55:00.000Z',
    last_seen_at: '2026-03-23T04:55:00.000Z',
    is_competitor: true,
    notes: 'Praha Holešovice',
  },
  {
    id: 'portal-demo-4',
    portal: 'sreality',
    title: 'Byt 2+1, Karlín',
    price: 7120000,
    city: 'Praha',
    district: 'Karlín',
    url: 'https://www.sreality.cz/detail/prodej/byt/karlin-demo-4',
    first_seen_at: '2026-03-23T05:05:00.000Z',
    last_seen_at: '2026-03-23T05:05:00.000Z',
    is_competitor: true,
    notes: 'Praha Karlín',
  },
];

function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/[,\n;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPriceCs(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 'Cena na dotaz';
  return `${amount.toLocaleString('cs-CZ')} Kč`;
}

function formatDateTimeCs(value, timeZone = DEFAULT_TIMEZONE) {
  const date = asDate(value);
  if (!date) return 'N/A';
  return date.toLocaleString('cs-CZ', {
    timeZone,
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPortalLabel(value) {
  const normalized = normalizeText(value);
  const labels = {
    sreality: 'Sreality',
    bezrealitky: 'Bezrealitky',
    reality_idnes: 'Reality.iDNES',
    dashboard: 'Dashboard',
    email: 'E-mail',
  };
  return labels[normalized] || (value ? String(value) : 'Neznámý zdroj');
}

function getDateKeyInTimezone(date, timeZone = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value || '0000';
  const month = parts.find((part) => part.type === 'month')?.value || '00';
  const day = parts.find((part) => part.type === 'day')?.value || '00';
  return `${year}-${month}-${day}`;
}

function countBy(items, getKey) {
  const result = {};
  for (const item of items) {
    const key = getKey(item) || 'other';
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function getListingTimestamp(listing) {
  return asDate(listing.last_seen_at || listing.first_seen_at || listing.listed_at || listing.updated_at);
}

function mapPropertyToListing(property) {
  return {
    id: property.id,
    portal: property.source || 'other',
    title: property.title,
    price: property.price,
    city: property.city,
    district: property.district,
    url: property.source_url || '',
    first_seen_at: property.listed_at,
    last_seen_at: property.updated_at || property.listed_at,
    is_competitor: normalizeText(property.source) !== 'internal',
    notes: property.address || '',
  };
}

function locationMatches(listing, locationQuery) {
  const query = normalizeText(locationQuery);
  if (!query) return true;

  const tokens = query
    .split(/[\s,/-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);

  if (tokens.length === 0) return true;

  const haystack = normalizeText([
    listing.title,
    listing.city,
    listing.district,
    listing.notes,
    listing.url,
  ].filter(Boolean).join(' '));

  return tokens.every((token) => haystack.includes(token));
}

function matchesFilters(listing, filters) {
  const activeFilters = filters && typeof filters === 'object' ? filters : {};
  const price = Number(listing.price || 0);

  if (activeFilters.min_price && price > 0 && price < Number(activeFilters.min_price)) return false;
  if (activeFilters.max_price && price > 0 && price > Number(activeFilters.max_price)) return false;

  const rooms = String(activeFilters.rooms || '').trim();
  if (rooms && !normalizeText(listing.title).includes(normalizeText(rooms))) return false;

  return true;
}

function dedupeListings(listings) {
  const seen = new Set();
  return listings.filter((listing) => {
    const key = listing.url || `${listing.portal}|${listing.title}|${listing.price}|${listing.city}|${listing.district}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shouldRunMonitor(monitor, now) {
  const timeZone = monitor.timezone || DEFAULT_TIMEZONE;
  if (!monitor.last_run_at) return true;
  const lastRun = asDate(monitor.last_run_at);
  if (!lastRun) return true;
  return getDateKeyInTimezone(now, timeZone) !== getDateKeyInTimezone(lastRun, timeZone);
}

function buildWindowStart(monitor, now) {
  const lastDigest = asDate(monitor.last_digest_at);
  if (lastDigest) return lastDigest;
  const lastRun = asDate(monitor.last_run_at);
  if (lastRun) return lastRun;
  return new Date(now.getTime() - DEFAULT_LOOKBACK_HOURS * 60 * 60 * 1000);
}

function parseChannels(channel) {
  const normalized = normalizeText(channel);
  return {
    dashboard: !normalized || normalized.includes('dashboard'),
    email: normalized.includes('email'),
  };
}

function resolveRecipients(monitor) {
  const target = monitor.delivery_target || process.env.REALITY_MONITOR_DIGEST_EMAIL || process.env.CONTACT_NOTIFY_EMAIL || '';
  return target
    .split(/[,\s;]+/)
    .map((item) => item.trim())
    .filter((item) => item.includes('@'));
}

function summarizeMonitor(listings, locationQuery) {
  if (listings.length === 0) {
    return {
      summary: `Od posledního běhu se v lokalitě ${locationQuery} neobjevily žádné nové nabídky.`,
      portalSummary: 'bez nových nabídek',
      minPrice: null,
      maxPrice: null,
      topDistrict: locationQuery,
    };
  }

  const portalCounts = countBy(listings, (listing) => listing.portal);
  const portalSummary = Object.entries(portalCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([portal, count]) => `${formatPortalLabel(portal)} ${count}`)
    .join(', ');

  const prices = listings
    .map((listing) => Number(listing.price || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const districts = countBy(listings, (listing) => listing.district || listing.city || locationQuery);
  const topDistrict = Object.entries(districts).sort((a, b) => b[1] - a[1])[0]?.[0] || locationQuery;
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;
  const priceRange = minPrice && maxPrice
    ? `Cenové rozpětí je ${formatPriceCs(minPrice)} až ${formatPriceCs(maxPrice)}.`
    : 'U části nabídek zatím chybí cena.';

  return {
    summary: `Našel jsem ${listings.length} nových nabídek pro lokalitu ${locationQuery}. Zdroje: ${portalSummary}. ${priceRange}`,
    portalSummary,
    minPrice,
    maxPrice,
    topDistrict,
  };
}

function buildDigestPayload(monitor, listings, source, generatedAt) {
  const locationQuery = monitor.location_query || 'monitorovaná lokalita';
  const summary = summarizeMonitor(listings, locationQuery);
  const previewListings = listings.slice(0, MAX_DIGEST_LISTINGS).map((listing) => ({
    portal: formatPortalLabel(listing.portal),
    title: listing.title,
    location: [listing.district, listing.city].filter(Boolean).join(', '),
    price: formatPriceCs(listing.price),
    url: listing.url || null,
    seenAt: listing.last_seen_at || listing.first_seen_at || null,
  }));

  return {
    artifactTitle: `Ranní digest: ${locationQuery}`,
    alertTitle: `Ranní digest: ${locationQuery}`,
    alertDescription: listings.length > 0
      ? `${listings.length} nových nabídek. ${summary.portalSummary}.`
      : `Dnes bez nových nabídek v lokalitě ${locationQuery}.`,
    emailSubject: listings.length > 0
      ? `Ranní digest ${locationQuery}: ${listings.length} nových nabídek`
      : `Ranní digest ${locationQuery}: bez nových nabídek`,
    summaryText: summary.summary,
    payload: {
      type: 'morning_digest',
      generated_at: generatedAt,
      source,
      monitor: {
        id: monitor.id,
        name: monitor.name,
        location_query: locationQuery,
        schedule_label: monitor.schedule_label,
        timezone: monitor.timezone || DEFAULT_TIMEZONE,
      },
      metrics: {
        total_listings: listings.length,
        top_district: summary.topDistrict,
        min_price: summary.minPrice,
        max_price: summary.maxPrice,
        portal_summary: summary.portalSummary,
      },
      summary: summary.summary,
      listings: previewListings,
    },
  };
}

async function loadCandidateListings() {
  if (!isConfigured()) {
    return { rows: DEMO_PORTAL_LISTINGS, source: 'demo' };
  }

  try {
    const portalListings = await queryTable(
      'portal_listings',
      'select=id,portal,title,price,city,district,url,first_seen_at,last_seen_at,is_competitor,notes&order=last_seen_at.desc&limit=400'
    );
    if (portalListings.length > 0) {
      return { rows: portalListings, source: 'portal_listings' };
    }
  } catch {
    // Fall through to properties.
  }

  try {
    const properties = await queryTable(
      'properties',
      'select=id,title,price,city,district,address,source,source_url,listed_at,updated_at,status&order=listed_at.desc&limit=400'
    );
    return {
      rows: properties.map(mapPropertyToListing).filter((listing) => listing.url || listing.portal),
      source: 'properties',
    };
  } catch {
    return { rows: DEMO_PORTAL_LISTINGS, source: 'demo' };
  }
}

async function storeArtifact(title, payload) {
  const inserted = await insertRows('generated_artifacts', {
    kind: 'report',
    title,
    payload,
  });
  return inserted?.[0]?.id || null;
}

async function storeAlert(title, description, severity = 'low') {
  const inserted = await insertRows('alerts', {
    type: 'portal_update',
    title,
    description,
    severity,
    read: false,
  });
  return inserted?.[0]?.id || null;
}

async function sendDigestEmail(monitor, digestPayload, listings) {
  const recipients = resolveRecipients(monitor);
  const resendKey = process.env.RESEND_API_KEY;

  if (recipients.length === 0) {
    return { status: 'skipped', reason: 'missing_recipient' };
  }
  if (!resendKey) {
    return { status: 'skipped', reason: 'missing_resend_key' };
  }

  const dashboardUrl = process.env.REALITY_MONITOR_DASHBOARD_URL || 'https://reality.worldmonitor.app';
  const from = process.env.REALITY_MONITOR_FROM_EMAIL || 'Reality Monitor <noreply@worldmonitor.app>';
  const previewListings = listings.slice(0, MAX_EMAIL_LISTINGS);
  const listHtml = previewListings.length > 0
    ? previewListings.map((listing) => `
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e8ecf1;">
            <div style="font-weight: 600; color: #102033;">${escapeHtml(listing.title)}</div>
            <div style="font-size: 12px; color: #607086;">${escapeHtml([listing.district, listing.city].filter(Boolean).join(', ') || 'Lokalita neuvedena')}</div>
          </td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e8ecf1; color: #102033;">${escapeHtml(formatPortalLabel(listing.portal))}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e8ecf1; color: #102033;">${escapeHtml(formatPriceCs(listing.price))}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e8ecf1; color: #607086;">${escapeHtml(formatDateTimeCs(getListingTimestamp(listing), monitor.timezone || DEFAULT_TIMEZONE))}</td>
        </tr>
      `).join('')
    : `
      <tr>
        <td colspan="4" style="padding: 14px 12px; color: #607086; text-align: center;">
          Dnes nejsou v monitorované lokalitě žádné nové nabídky.
        </td>
      </tr>
    `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: digestPayload.emailSubject,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f7fb; padding: 24px;">
          <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #d7e0ea; border-radius: 16px; overflow: hidden;">
            <div style="padding: 24px 28px; background: linear-gradient(135deg, #102033 0%, #1d4266 100%); color: #ffffff;">
              <div style="font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.75;">Reality Monitor</div>
              <h1 style="margin: 10px 0 8px; font-size: 28px; line-height: 1.1;">${escapeHtml(digestPayload.artifactTitle)}</h1>
              <p style="margin: 0; font-size: 14px; line-height: 1.6; opacity: 0.92;">${escapeHtml(digestPayload.summaryText)}</p>
            </div>
            <div style="padding: 24px 28px;">
              <table style="width: 100%; border-collapse: collapse; border: 1px solid #e8ecf1; border-radius: 12px; overflow: hidden;">
                <thead>
                  <tr style="background: #f7f9fc; text-align: left;">
                    <th style="padding: 10px 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #607086;">Nabídka</th>
                    <th style="padding: 10px 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #607086;">Portál</th>
                    <th style="padding: 10px 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #607086;">Cena</th>
                    <th style="padding: 10px 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #607086;">Zachyceno</th>
                  </tr>
                </thead>
                <tbody>${listHtml}</tbody>
              </table>
              <div style="margin-top: 20px;">
                <a href="${escapeHtml(dashboardUrl)}" style="display: inline-block; background: #102033; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 999px; font-weight: 600;">
                  Otevřít dashboard
                </a>
              </div>
            </div>
          </div>
        </div>`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }

  return { status: 'sent', recipients };
}

export default async function handler(req) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isConfigured()) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Supabase not configured',
      preview: summarizeMonitor(DEMO_PORTAL_LISTINGS.filter((listing) => locationMatches(listing, 'Praha Holešovice')), 'Praha Holešovice'),
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = new Date();
  const results = {
    processed: 0,
    skipped: 0,
    alertsCreated: 0,
    artifactsCreated: 0,
    emailsSent: 0,
    errors: [],
    monitors: [],
  };

  try {
    const monitors = await queryTable(
      'saved_monitors',
      'select=id,name,location_query,sources,filters,cron_expr,schedule_label,delivery_channel,delivery_target,timezone,enabled,last_run_at,last_digest_at,last_run_status,created_at&enabled=eq.true&order=created_at.asc&limit=100'
    );
    const listingsRes = await loadCandidateListings();

    for (const monitor of monitors) {
      if (!shouldRunMonitor(monitor, now)) {
        results.skipped += 1;
        results.monitors.push({
          id: monitor.id,
          name: monitor.name,
          status: 'skipped',
          reason: 'already_ran_today',
        });
        continue;
      }

      try {
        const channels = parseChannels(monitor.delivery_channel);
        const windowStart = buildWindowStart(monitor, now);
        const sources = toArray(monitor.sources).map((source) => normalizeText(source));
        const filteredListings = dedupeListings(
          listingsRes.rows
            .filter((listing) => {
              const seenAt = getListingTimestamp(listing);
              return seenAt && seenAt >= windowStart && seenAt <= now;
            })
            .filter((listing) => {
              if (sources.length === 0) return true;
              return sources.includes(normalizeText(listing.portal));
            })
            .filter((listing) => locationMatches(listing, monitor.location_query))
            .filter((listing) => matchesFilters(listing, monitor.filters))
            .sort((a, b) => (getListingTimestamp(b)?.getTime() || 0) - (getListingTimestamp(a)?.getTime() || 0))
        );

        const digestPayload = buildDigestPayload(monitor, filteredListings, listingsRes.source, now.toISOString());
        let artifactId = null;
        let alertId = null;
        let emailStatus = { status: 'skipped', reason: 'channel_disabled' };

        artifactId = await storeArtifact(digestPayload.artifactTitle, digestPayload.payload);
        if (artifactId) results.artifactsCreated += 1;

        if (channels.dashboard) {
          alertId = await storeAlert(
            digestPayload.alertTitle,
            digestPayload.alertDescription,
            filteredListings.length > 0 ? 'medium' : 'low'
          );
          if (alertId) results.alertsCreated += 1;
        }

        if (channels.email) {
          emailStatus = await sendDigestEmail(monitor, digestPayload, filteredListings);
          if (emailStatus.status === 'sent') results.emailsSent += 1;
        }

        const statusParts = [];
        if (channels.dashboard) statusParts.push('dashboard');
        if (emailStatus.status === 'sent') statusParts.push('email_sent');
        if (channels.email && emailStatus.status !== 'sent') {
          statusParts.push(`email_${emailStatus.reason || 'skipped'}`);
        }
        if (statusParts.length === 0) statusParts.push('stored');

        await updateRows(
          'saved_monitors',
          `id=eq.${monitor.id}`,
          {
            last_run_at: now.toISOString(),
            last_digest_at: now.toISOString(),
            last_run_status: statusParts.join(','),
          }
        );

        results.processed += 1;
        results.monitors.push({
          id: monitor.id,
          name: monitor.name,
          status: 'processed',
          listings: filteredListings.length,
          channels: statusParts,
          artifactId,
          alertId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.errors.push(`${monitor.name}: ${message}`);
        await updateRows(
          'saved_monitors',
          `id=eq.${monitor.id}`,
          {
            last_run_at: now.toISOString(),
            last_run_status: `error:${message.slice(0, 180)}`,
          }
        );
        results.monitors.push({
          id: monitor.id,
          name: monitor.name,
          status: 'error',
          error: message,
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      timestamp: now.toISOString(),
      listingSource: listingsRes.source,
      ...results,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      ...results,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
