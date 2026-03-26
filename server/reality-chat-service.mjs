import { createServer } from 'node:http';
import chatHandler from '../api/chat.js';

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const SERVICE_KEY = String(process.env.REALITY_CHAT_SERVICE_KEY || '').trim();

function getBaseUrl(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim() || 'http';
  const host = String(req.headers.host || `127.0.0.1:${PORT}`);
  return `${proto}://${host}`;
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : null;
}

function toFetchHeaders(nodeHeaders) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeHeaders || {})) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (typeof value === 'string') {
      headers.set(key, value);
    }
  }
  return headers;
}

async function writeFetchResponse(nodeRes, response, method) {
  nodeRes.statusCode = response.status;
  response.headers.forEach((value, key) => {
    nodeRes.setHeader(key, value);
  });

  if (method === 'HEAD') {
    nodeRes.end();
    return;
  }

  const body = Buffer.from(await response.arrayBuffer());
  nodeRes.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', getBaseUrl(req));

    if (url.pathname === '/healthz' || url.pathname === '/readyz') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        ok: true,
        service: 'reality-chat-service',
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    if (url.pathname !== '/api/chat') {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    if (SERVICE_KEY) {
      const headerKey = String(req.headers['x-worldmonitor-key'] || '').trim();
      const authHeader = String(req.headers.authorization || '').trim();
      const bearerKey = authHeader.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7).trim()
        : '';

      if (headerKey !== SERVICE_KEY && bearerKey !== SERVICE_KEY) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Forbidden' }));
        return;
      }
    }

    const body = req.method === 'GET' || req.method === 'HEAD' ? null : await readRequestBody(req);
    const request = new Request(url.toString(), {
      method: req.method,
      headers: toFetchHeaders(req.headers),
      body: body ?? undefined,
    });

    const response = await chatHandler(request);
    await writeFetchResponse(res, response, req.method || 'GET');
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'Reality chat service failed',
      message: error instanceof Error ? error.message : String(error),
    }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`reality-chat-service listening on http://${HOST}:${PORT}`);
});
