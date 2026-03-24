// Shared Supabase client for Vercel API routes
// Uses service_role key — server-side only, never expose to client

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function supabaseHeaders() {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
}

export function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

/**
 * Execute a PostgREST query against Supabase.
 * @param {string} table - Table name
 * @param {string} query - PostgREST query string (e.g. "select=*&city=eq.Praha&order=price.desc&limit=20")
 * @returns {Promise<any[]>}
 */
export async function queryTable(table, query = 'select=*') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, { headers: supabaseHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase query failed: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * Insert rows into a table.
 * @param {string} table
 * @param {object|object[]} data
 * @param {{ upsert?: boolean, onConflict?: string }} options
 */
export async function insertRows(table, data, options = {}) {
  const headers = { ...supabaseHeaders() };
  if (options.upsert) {
    headers['Prefer'] = `resolution=merge-duplicates,return=representation`;
  }
  const url = options.onConflict
    ? `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${options.onConflict}`
    : `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(Array.isArray(data) ? data : [data]),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase insert failed: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * Update rows in a table matching a PostgREST filter query.
 * @param {string} table
 * @param {string} matchQuery - PostgREST filter query (e.g. "id=eq.<uuid>")
 * @param {object} data
 */
export async function updateRows(table, matchQuery, data) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${matchQuery}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: supabaseHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase update failed: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * Execute a Supabase RPC function.
 * @param {string} fnName
 * @param {object} params
 */
export async function callRpc(fnName, params = {}) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${fnName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: supabaseHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase RPC failed: ${res.status} ${text}`);
  }
  return res.json();
}

export { SUPABASE_URL, SUPABASE_KEY };
