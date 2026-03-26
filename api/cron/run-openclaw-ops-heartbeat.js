import { insertRows, isConfigured, queryTable } from '../_supabase.js';
import {
  buildOpenClawSessionKey,
  isOpenClawHooksConfigured,
  sendOpenClawAgentHook,
} from '../_openclaw.js';

export const config = { runtime: 'nodejs', maxDuration: 60 };

const DEFAULT_TIMEZONE = process.env.OPENCLAW_OPS_HEARTBEAT_TIMEZONE || 'Europe/Prague';
const DEFAULT_START_HOUR = Number(process.env.OPENCLAW_OPS_HEARTBEAT_START_HOUR || 8);
const DEFAULT_END_HOUR = Number(process.env.OPENCLAW_OPS_HEARTBEAT_END_HOUR || 19);
const ACTIVE_LEAD_STATUSES = new Set(['new', 'contacted', 'viewing_scheduled', 'viewing_done', 'offer_made', 'negotiating']);

const DEMO_LEADS = [
  {
    id: 'lead-demo-1',
    status: 'contacted',
    next_action: 'Potvrdit termín prohlídky',
    next_action_date: '2026-03-25T08:30:00.000Z',
    updated_at: '2026-03-22T10:00:00.000Z',
    client_id: 'client-demo-1',
    property_id: 'property-demo-1',
  },
  {
    id: 'lead-demo-2',
    status: 'new',
    next_action: 'První kontakt',
    next_action_date: null,
    updated_at: '2026-03-21T09:00:00.000Z',
    client_id: 'client-demo-2',
    property_id: 'property-demo-2',
  },
];

const DEMO_CLIENTS = [
  { id: 'client-demo-1', name: 'Jan Král' },
  { id: 'client-demo-2', name: 'Eva Vondráková' },
];

const DEMO_PROPERTIES = [
  {
    id: 'property-demo-1',
    title: 'Byt 2+kk, Holešovice',
    city: 'Praha',
    district: 'Holešovice',
    status: 'aktivní',
    description: 'Moderní byt v rezidenčním domě.',
    renovation_status: 'unknown',
    building_modifications: [],
    reconstruction_notes: null,
    energy_rating: 'B',
    updated_at: '2026-03-24T08:00:00.000Z',
  },
  {
    id: 'property-demo-2',
    title: 'Byt 3+kk, Karlín',
    city: 'Praha',
    district: 'Karlín',
    status: 'aktivní',
    description: null,
    renovation_status: 'partial',
    building_modifications: ['nová elektroinstalace'],
    reconstruction_notes: null,
    energy_rating: null,
    updated_at: '2026-03-23T14:00:00.000Z',
  },
];

const DEMO_TASKS = [
  {
    id: 'task-demo-1',
    title: 'Doplnit rekonstrukci u Holešovic',
    status: 'todo',
    priority: 'high',
    due_at: '2026-03-25T09:00:00.000Z',
    workflow_type: 'data_completion',
  },
  {
    id: 'task-demo-2',
    title: 'Ověřit dostupnost makléře',
    status: 'blocked',
    priority: 'medium',
    due_at: '2026-03-25T12:00:00.000Z',
    workflow_type: 'viewing_preparation',
  },
];

const DEMO_EVENTS = [
  {
    id: 'event-demo-1',
    title: 'Prohlídka Holešovice',
    type: 'viewing',
    start_at: '2026-03-25T12:30:00.000Z',
    end_at: '2026-03-25T13:15:00.000Z',
    location: 'Praha 7',
    completed: false,
  },
];

const DEMO_MONITORS = [
  {
    id: 'monitor-demo-1',
    name: 'Praha Holešovice scout',
    location_query: 'Praha Holešovice',
    enabled: true,
    last_run_at: '2026-03-24T08:00:00.000Z',
    last_run_status: 'error:timeout contacting portal source',
  },
];

function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toHourInTimezone(date, timeZone = DEFAULT_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  });
  return Number(formatter.format(date));
}

function isWithinActiveHours(date, timeZone = DEFAULT_TIMEZONE, startHour = DEFAULT_START_HOUR, endHour = DEFAULT_END_HOUR) {
  const hour = toHourInTimezone(date, timeZone);
  return hour >= startHour && hour < endHour;
}

function formatDateTimeCs(value, timeZone = DEFAULT_TIMEZONE) {
  const date = asDate(value);
  if (!date) return 'bez termínu';
  return date.toLocaleString('cs-CZ', {
    timeZone,
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function mapById(rows) {
  return Object.fromEntries((Array.isArray(rows) ? rows : []).map((row) => [row.id, row]));
}

async function loadOpsData() {
  if (!isConfigured()) {
    return {
      source: 'demo',
      leads: DEMO_LEADS,
      clients: DEMO_CLIENTS,
      properties: DEMO_PROPERTIES,
      tasks: DEMO_TASKS,
      calendarEvents: DEMO_EVENTS,
      monitors: DEMO_MONITORS,
    };
  }

  const [
    leads,
    clients,
    properties,
    tasks,
    calendarEvents,
    monitors,
  ] = await Promise.all([
    queryTable('leads', 'select=id,status,next_action,next_action_date,updated_at,client_id,property_id&order=updated_at.desc&limit=150'),
    queryTable('clients', 'select=id,name&limit=300'),
    queryTable('properties', 'select=id,title,city,district,status,description,renovation_status,building_modifications,reconstruction_notes,energy_rating,updated_at&status=eq.aktivní&limit=300'),
    queryTable('operations_tasks', 'select=id,title,status,priority,due_at,workflow_type,created_at&order=created_at.desc&limit=150'),
    queryTable('calendar_events', 'select=id,title,type,start_at,end_at,location,completed&order=start_at.asc&limit=120'),
    queryTable('saved_monitors', 'select=id,name,location_query,enabled,last_run_at,last_run_status&enabled=eq.true&limit=80'),
  ]);

  return {
    source: 'supabase',
    leads,
    clients,
    properties,
    tasks,
    calendarEvents,
    monitors,
  };
}

function buildSnapshot(data, now) {
  const clientById = mapById(data.clients);
  const propertyById = mapById(data.properties);
  const threeDaysAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000);
  const oneDayAhead = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const oneAndHalfDaysAgo = new Date(now.getTime() - 36 * 60 * 60 * 1000);

  const overdueTasks = data.tasks
    .filter((task) => task.status !== 'done')
    .filter((task) => {
      const dueAt = asDate(task.due_at);
      return dueAt && dueAt <= now;
    })
    .slice(0, 6)
    .map((task) => ({
      id: task.id,
      title: task.title,
      priority: task.priority,
      dueAt: task.due_at,
      workflowType: task.workflow_type || null,
    }));

  const blockedTasks = data.tasks
    .filter((task) => task.status === 'blocked')
    .slice(0, 6)
    .map((task) => ({
      id: task.id,
      title: task.title,
      priority: task.priority,
      dueAt: task.due_at,
    }));

  const staleLeads = data.leads
    .filter((lead) => ACTIVE_LEAD_STATUSES.has(String(lead.status || '').trim()))
    .filter((lead) => {
      const nextActionDate = asDate(lead.next_action_date);
      const updatedAt = asDate(lead.updated_at);
      return (nextActionDate && nextActionDate <= now) || (updatedAt && updatedAt <= threeDaysAgo);
    })
    .slice(0, 6)
    .map((lead) => ({
      id: lead.id,
      clientName: clientById[lead.client_id]?.name || 'Neznámý klient',
      propertyTitle: propertyById[lead.property_id]?.title || 'Bez přiřazené nemovitosti',
      status: lead.status,
      nextAction: lead.next_action || 'bez další akce',
      nextActionDate: lead.next_action_date,
      updatedAt: lead.updated_at,
    }));

  const missingPropertyData = data.properties
    .filter((property) => {
      const renovationMissing = !property.renovation_status || property.renovation_status === 'unknown';
      const modificationsMissing = !Array.isArray(property.building_modifications) || property.building_modifications.length === 0;
      const notesMissing = !String(property.reconstruction_notes || '').trim();
      return renovationMissing || modificationsMissing || notesMissing;
    })
    .slice(0, 8)
    .map((property) => ({
      id: property.id,
      title: property.title,
      location: [property.city, property.district].filter(Boolean).join(', '),
      renovationStatus: property.renovation_status || 'nezadáno',
      buildingModifications: Array.isArray(property.building_modifications) ? property.building_modifications.length : 0,
      hasReconstructionNotes: Boolean(String(property.reconstruction_notes || '').trim()),
    }));

  const todayEvents = data.calendarEvents
    .filter((event) => !event.completed)
    .filter((event) => {
      const startAt = asDate(event.start_at);
      return startAt && startAt >= now && startAt <= oneDayAhead;
    })
    .slice(0, 8)
    .map((event) => ({
      id: event.id,
      title: event.title,
      type: event.type,
      startAt: event.start_at,
      endAt: event.end_at,
      location: event.location || '',
    }));

  const failingMonitors = data.monitors
    .filter((monitor) => {
      const status = String(monitor.last_run_status || '');
      const lastRunAt = asDate(monitor.last_run_at);
      if (status.toLowerCase().startsWith('error:')) return true;
      if (!lastRunAt) return true;
      return lastRunAt <= oneAndHalfDaysAgo;
    })
    .slice(0, 6)
    .map((monitor) => ({
      id: monitor.id,
      name: monitor.name,
      locationQuery: monitor.location_query || '',
      lastRunAt: monitor.last_run_at,
      lastRunStatus: monitor.last_run_status || 'bez stavu',
    }));

  const criticalCount = overdueTasks.length + blockedTasks.length + staleLeads.length + failingMonitors.length;
  const actionableCount = criticalCount + missingPropertyData.length + todayEvents.length;

  const summaryLines = [
    overdueTasks.length > 0 ? `${overdueTasks.length} úkolů je po termínu.` : null,
    blockedTasks.length > 0 ? `${blockedTasks.length} úkolů je blokovaných.` : null,
    staleLeads.length > 0 ? `${staleLeads.length} leadů potřebuje follow-up.` : null,
    missingPropertyData.length > 0 ? `${missingPropertyData.length} aktivních nemovitostí má neúplná data o rekonstrukci.` : null,
    todayEvents.length > 0 ? `${todayEvents.length} událostí čeká v příštích 24 hodinách.` : null,
    failingMonitors.length > 0 ? `${failingMonitors.length} monitorů vykazuje chybu nebo zastaralý běh.` : null,
  ].filter(Boolean);

  return {
    source: data.source,
    generatedAt: now.toISOString(),
    timezone: DEFAULT_TIMEZONE,
    activeHours: {
      startHour: DEFAULT_START_HOUR,
      endHour: DEFAULT_END_HOUR,
    },
    counts: {
      criticalCount,
      actionableCount,
      overdueTasks: overdueTasks.length,
      blockedTasks: blockedTasks.length,
      staleLeads: staleLeads.length,
      missingPropertyData: missingPropertyData.length,
      todayEvents: todayEvents.length,
      failingMonitors: failingMonitors.length,
    },
    summaryLines,
    overdueTasks,
    blockedTasks,
    staleLeads,
    missingPropertyData,
    todayEvents,
    failingMonitors,
  };
}

function buildHeartbeatMessage(snapshot) {
  const preview = {
    counts: snapshot.counts,
    summaryLines: snapshot.summaryLines,
    overdueTasks: snapshot.overdueTasks,
    blockedTasks: snapshot.blockedTasks,
    staleLeads: snapshot.staleLeads,
    missingPropertyData: snapshot.missingPropertyData,
    todayEvents: snapshot.todayEvents,
    failingMonitors: snapshot.failingMonitors,
  };

  return [
    'Jsi WorldMonitor Operations Heartbeat pro českou realitní kancelář.',
    'Přečti AGENTS.md, HEARTBEAT.md a skill reality_ops, pokud jsou v OpenClaw workspace dostupné.',
    'Pokud snapshot nevyžaduje žádnou akci, odpověz přesně HEARTBEAT_OK.',
    'Jinak odpověz česky, stručně a prioritizovaně:',
    '1. Krátký souhrn rizik.',
    '2. 3-5 konkrétních dalších kroků.',
    '3. Co patří do dashboard alertu, co do CRM/tasků a co do e-mailu nebo kalendáře.',
    '',
    `Čas snapshotu: ${snapshot.generatedAt}`,
    `Časové pásmo: ${snapshot.timezone}`,
    `Souhrn: ${snapshot.summaryLines.join(' ') || 'Bez nových odchylek.'}`,
    '',
    `SNAPSHOT_JSON=${JSON.stringify(preview)}`,
  ].join('\n');
}

async function storeHeartbeatArtifact(snapshot, hookResult) {
  if (!isConfigured()) return null;
  const inserted = await insertRows('generated_artifacts', {
    kind: 'report',
    title: `OpenClaw Ops Heartbeat ${snapshot.generatedAt}`,
    payload: {
      source: 'openclaw-ops-heartbeat',
      snapshot,
      hook: hookResult,
    },
  });
  return inserted[0]?.id || null;
}

async function storeHeartbeatAlert(snapshot) {
  if (!isConfigured() || snapshot.counts.actionableCount === 0) return null;
  const severity = snapshot.counts.criticalCount > 0 ? 'high' : 'medium';
  const title = snapshot.counts.criticalCount > 0
    ? `Ops heartbeat: ${snapshot.counts.criticalCount} urgentních položek`
    : `Ops heartbeat: ${snapshot.counts.actionableCount} položek k revizi`;
  const description = (snapshot.summaryLines.join(' ') || 'Bez nových odchylek.').slice(0, 280);
  const inserted = await insertRows('alerts', {
    type: 'deadline',
    title,
    description,
    severity,
  });
  return inserted[0]?.id || null;
}

export default async function handler(req) {
  const now = new Date();
  const url = new URL(req.url);
  const force = ['1', 'true', 'yes'].includes(url.searchParams.get('force') || '');
  const deliver = ['1', 'true', 'yes'].includes(url.searchParams.get('deliver') || '');
  const enabled = ['1', 'true', 'yes'].includes(String(process.env.OPENCLAW_OPS_HEARTBEAT_ENABLED || '0').toLowerCase());

  if (!['GET', 'POST'].includes(req.method)) {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!enabled && !force) {
    return new Response(JSON.stringify({
      success: true,
      skipped: true,
      reason: 'disabled',
      timestamp: now.toISOString(),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!force && !isWithinActiveHours(now, DEFAULT_TIMEZONE)) {
    return new Response(JSON.stringify({
      success: true,
      skipped: true,
      reason: 'outside_active_hours',
      timestamp: now.toISOString(),
      timezone: DEFAULT_TIMEZONE,
      activeHours: {
        startHour: DEFAULT_START_HOUR,
        endHour: DEFAULT_END_HOUR,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const data = await loadOpsData();
    const snapshot = buildSnapshot(data, now);
    if (snapshot.counts.actionableCount === 0) {
      const artifactId = await storeHeartbeatArtifact(snapshot, { skipped: true, reason: 'no_actionable_items' });
      const alertId = await storeHeartbeatAlert(snapshot);
      return new Response(JSON.stringify({
        success: true,
        skipped: true,
        reason: 'no_actionable_items',
        timestamp: now.toISOString(),
        source: data.source,
        artifactId,
        alertId,
        snapshot,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!isOpenClawHooksConfigured()) {
      const artifactId = await storeHeartbeatArtifact(snapshot, { skipped: true, reason: 'hooks_not_configured' });
      const alertId = await storeHeartbeatAlert(snapshot);
      return new Response(JSON.stringify({
        success: true,
        skipped: true,
        reason: 'hooks_not_configured',
        timestamp: now.toISOString(),
        source: data.source,
        artifactId,
        alertId,
        snapshot,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const hookResult = await sendOpenClawAgentHook({
      message: buildHeartbeatMessage(snapshot),
      name: 'WorldMonitor Ops Heartbeat',
      sessionKey: buildOpenClawSessionKey('ops', 'heartbeat'),
      wakeMode: process.env.OPENCLAW_OPS_HEARTBEAT_WAKE_MODE || 'next-heartbeat',
      deliver,
    });
    const artifactId = await storeHeartbeatArtifact(snapshot, hookResult);
    const alertId = await storeHeartbeatAlert(snapshot);

    return new Response(JSON.stringify({
      success: true,
      timestamp: now.toISOString(),
      source: data.source,
      artifactId,
      alertId,
      snapshot,
      hook: hookResult,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      timestamp: now.toISOString(),
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
