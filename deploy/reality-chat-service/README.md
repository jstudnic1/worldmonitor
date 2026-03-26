# Reality Chat Service

Standalone Node service for `Reality Monitor` chat. This is meant to run outside Vercel so `OpenRouter` and `OpenClaw` calls do not depend on Vercel serverless timeouts.

## What It Exposes

- `POST /api/chat`
- `GET /healthz`
- `GET /readyz`

## Deploy Shape

Keep the frontend on Vercel.

Run this service on any Docker-capable host:

- Railway
- Render
- Fly.io
- VPS / Hetzner / DigitalOcean

Use the Dockerfile:

- `deploy/reality-chat-service/Dockerfile`

Build context must be the repository root.

## Render Quickstart

The repository includes a ready Blueprint in:

- `render.yaml`

Fastest path:

1. Push this branch to GitHub.
2. In Render, create a new Blueprint from the repo.
3. Select the `reality-chat-service`.
4. Fill these secret env vars in Render:
   - `OPENROUTER_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `REALITY_CHAT_SERVICE_KEY`
5. Deploy.
6. Copy the resulting Render URL.
7. In Vercel, set:
   - `REALITY_CHAT_UPSTREAM_URL=https://your-render-service.onrender.com`
   - `REALITY_CHAT_UPSTREAM_KEY=<same key as REALITY_CHAT_SERVICE_KEY>`
8. Redeploy the Vercel frontend.

For demo use, the Blueprint uses `plan: free`.
For production-like uptime, switch the Render service to `starter` or higher.

## Required Environment Variables

- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `OPENCLAW_BASE_URL`
- `OPENCLAW_MODEL`
- `OPENCLAW_GATEWAY_TOKEN`
- `OPENCLAW_API_KEY`
- `OPENCLAW_ROUTE_NAME`
- `OPENCLAW_ALLOW_INSECURE_TLS`
- `CHAT_FORCE_DEMO_MODE`
- `CHAT_DATA_TIMEOUT_MS`
- `CHAT_WRITE_TIMEOUT_MS`
- `OPENROUTER_TIMEOUT_MS`

## Optional Service Auth

To avoid exposing a public unauthenticated chat endpoint, set:

- `REALITY_CHAT_SERVICE_KEY`

Then send one of these headers from the upstream proxy:

- `X-WorldMonitor-Key: <key>`
- `Authorization: Bearer <key>`

## Vercel Frontend Proxy

Once the service is deployed, set these env vars on the Vercel frontend project:

- `REALITY_CHAT_UPSTREAM_URL=https://your-chat-service.example.com`
- `REALITY_CHAT_UPSTREAM_KEY=<same key as REALITY_CHAT_SERVICE_KEY>`

After that, the existing `/api/chat` route on Vercel becomes a thin proxy to this service.
