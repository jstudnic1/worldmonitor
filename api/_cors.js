const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/(.*\.)?worldmonitor\.app$/,
  /^https:\/\/worldmonitor-[a-z0-9-]+-elie-[a-z0-9]+\.vercel\.app$/,
  /^https:\/\/worldmonitor-[a-z0-9-]+-jstudnics-projects\.vercel\.app$/,
  /^https:\/\/worldmonitor-[a-z0-9-]+\.vercel\.app$/,
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/tauri\.localhost(:\d+)?$/,
  /^https?:\/\/[a-z0-9-]+\.tauri\.localhost(:\d+)?$/i,
  /^tauri:\/\/localhost$/,
  /^asset:\/\/localhost$/,
];

function isAllowedOrigin(origin) {
  return Boolean(origin) && ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

function readHeader(req, name) {
  if (!req?.headers) return '';

  if (typeof req.headers.get === 'function') {
    return req.headers.get(name) || '';
  }

  const lowerName = String(name || '').toLowerCase();
  const value = req.headers[lowerName] ?? req.headers[name] ?? req.headers[String(name || '').toUpperCase()];
  if (Array.isArray(value)) return value[0] || '';
  return typeof value === 'string' ? value : '';
}

export function getCorsHeaders(req, methods = 'GET, OPTIONS') {
  const origin = readHeader(req, 'origin');
  const allowOrigin = isAllowedOrigin(origin) ? origin : 'https://worldmonitor.app';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-WorldMonitor-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export function isDisallowedOrigin(req) {
  const origin = readHeader(req, 'origin');
  if (!origin) return false;
  return !isAllowedOrigin(origin);
}
