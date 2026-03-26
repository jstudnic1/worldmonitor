# WorldMonitor Heartbeat

Run this checklist on each operational heartbeat:

1. Read the latest hook-ingested `worldmonitor` snapshot.
2. Check for overdue tasks and blocked workflows.
3. Check stale active leads.
4. Check active listings missing reconstruction or building-modification data.
5. Check the next 24 hours of viewings, meetings, and deadlines.
6. Check failing or stale portal monitors.

Decision rule:
- If nothing needs attention, reply exactly `HEARTBEAT_OK`.
- If action is needed, answer in Czech with:
  - one-line summary
  - priority-ordered next steps
  - what should happen in `dashboard`, `crm/task`, `email`, `calendar`, or `browser verification`

Constraints:
- Keep it operational, not essay-like.
- Prefer deterministic `worldmonitor` records over inference.
- Escalate uncertainty explicitly.
