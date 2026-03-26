# OpenClaw Ops Setup

This folder is the `worldmonitor` side of the OpenClaw integration. The current codebase already supports direct model runs through [api/_openclaw.js](/Users/jakubstudnicka/Downloads/Vojta/worldmonitor/api/_openclaw.js), and now also supports hook-based ops ingress for recurring automation.

## What This Slice Adds

- dedicated hook bridge from `worldmonitor` into the Gateway
- a recurring ops heartbeat route: [api/cron/run-openclaw-ops-heartbeat.js](/Users/jakubstudnicka/Downloads/Vojta/worldmonitor/api/cron/run-openclaw-ops-heartbeat.js)
- workspace instructions for the Gateway agent: `AGENTS.md`, `HEARTBEAT.md`, and `skills/reality_ops/SKILL.md`

## Recommended Gateway Config

```json
{
  "session": {
    "dmScope": "per-channel-peer"
  },
  "hooks": {
    "enabled": true,
    "token": "${OPENCLAW_HOOKS_TOKEN}",
    "path": "/hooks",
    "allowedAgentIds": ["reality-ops", "main"],
    "defaultSessionKey": "hook:worldmonitor:ingress",
    "allowRequestSessionKey": true,
    "allowedSessionKeyPrefixes": ["hook:worldmonitor:"]
  },
  "agents": {
    "defaults": {
      "heartbeat": {
        "every": "30m",
        "target": "last",
        "activeHours": {
          "start": "08:00",
          "end": "19:00",
          "timezone": "Europe/Prague"
        }
      }
    }
  }
}
```

Why:
- `per-channel-peer` keeps Telegram DMs isolated per sender
- hook session keys stay inside the `hook:worldmonitor:*` namespace
- Gateway heartbeat cadence matches the app-level ops rhythm

## Session Key Scheme

Current app helper:
- `hook:worldmonitor:ops:heartbeat`
- future monitor-specific hooks: `hook:worldmonitor:monitor:<slug>`
- future inbox flows: `hook:worldmonitor:inbox:<source>`

This is built by `buildOpenClawSessionKey(...)` in [api/_openclaw.js](/Users/jakubstudnicka/Downloads/Vojta/worldmonitor/api/_openclaw.js).

## Environment Variables In `worldmonitor`

Required for hook-based automation:

```bash
OPENCLAW_BASE_URL=https://127.0.0.1:8080
OPENCLAW_HOOKS_TOKEN=...
OPENCLAW_HOOKS_AGENT_ID=reality-ops
OPENCLAW_HOOKS_ALLOW_REQUEST_SESSION_KEY=1
OPENCLAW_OPS_HEARTBEAT_ENABLED=1
```

Useful optional values:

```bash
OPENCLAW_HOOKS_PATH=/hooks
OPENCLAW_HOOKS_DEFAULT_CHANNEL=last
OPENCLAW_OPS_HEARTBEAT_TIMEZONE=Europe/Prague
OPENCLAW_OPS_HEARTBEAT_START_HOUR=8
OPENCLAW_OPS_HEARTBEAT_END_HOUR=19
OPENCLAW_OPS_HEARTBEAT_WAKE_MODE=next-heartbeat
```

## Manual Test

Once the Gateway hook endpoint is enabled:

```bash
curl -X POST "http://localhost:3000/api/cron/run-openclaw-ops-heartbeat?force=1" \
  -H "Content-Type: application/json"
```

Expected behavior:
- `worldmonitor` computes an ops snapshot from leads, tasks, properties, calendar events, and saved monitors
- the route stores a heartbeat artifact and dashboard alert when there is actionable work
- the route sends a hook-triggered agent turn to OpenClaw using the `reality-ops` agent/session

## Important Boundary

`worldmonitor` remains the source of truth for:
- Supabase data
- artifacts
- alerts
- tasks
- monitor execution state

OpenClaw should own:
- channel routing
- memory/session continuity
- heartbeat reasoning
- browser verification
- cross-channel agent behavior
