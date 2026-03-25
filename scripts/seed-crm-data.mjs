#!/usr/bin/env node
// Seed realistic CRM data for the Reality Monitor competition demo
// Actual schemas from Supabase:
// clients: id, name, email, phone, type, budget_min, budget_max, preferred_cities[], preferred_districts[], preferred_rooms[], preferred_type, notes, agent_id, created_at, updated_at
// leads: id, client_id, property_id, status, source, notes, next_action, next_action_date, created_at, updated_at
// sales: id, property_id, client_id, agent_id, sale_price, commission, commission_pct, contract_signed_at, closed_at, notes, created_at
// calendar_events: id, title, type, start_at, location, notes, client_id, created_at

const SUPABASE_URL = 'https://fwwkxhuefeachqauwvjp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3d2t4aHVlZmVhY2hxYXV3dmpwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDIxMzYxMCwiZXhwIjoyMDg5Nzg5NjEwfQ.aqwi3aAG-nKA5Z2YuD9HGvXnFEN70nEiRR_9PEwE8R4';

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

async function insert(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers, body: JSON.stringify([row]),
  });
  if (!res.ok) {
    const t = await res.text();
    if (t.includes('duplicate') || t.includes('23505')) return null;
    console.error(`  FAIL ${table}: ${t.slice(0, 120)}`);
    return null;
  }
  return res.json();
}

function uuid(prefix, n) {
  return `${prefix}-0000-0000-0000-${String(n).padStart(12, '0')}`;
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const FIRST_M = ['Jan', 'Petr', 'Martin', 'Tomáš', 'Jakub', 'David', 'Lukáš', 'Michal', 'Ondřej', 'Filip', 'Vojtěch', 'Adam', 'Daniel', 'Marek', 'Pavel', 'Robert', 'Jiří', 'Karel', 'Zdeněk', 'Radek'];
const FIRST_F = ['Jana', 'Eva', 'Lucie', 'Kateřina', 'Hana', 'Petra', 'Tereza', 'Markéta', 'Barbora', 'Veronika', 'Michaela', 'Simona', 'Nikola', 'Monika', 'Alena', 'Marie', 'Lenka', 'Andrea', 'Kristýna', 'Eliška'];
const LAST_M = ['Novák', 'Svoboda', 'Dvořák', 'Černý', 'Procházka', 'Kučera', 'Veselý', 'Horák', 'Němec', 'Pokorný', 'Marek', 'Pospíšil', 'Hájek', 'Jelínek', 'Král', 'Růžička', 'Beneš', 'Fiala', 'Sedláček', 'Doležal'];
const LAST_F = ['Nováková', 'Svobodová', 'Dvořáková', 'Černá', 'Procházková', 'Kučerová', 'Veselá', 'Horáková', 'Němcová', 'Pokorná', 'Marková', 'Pospíšilová', 'Hájková', 'Jelínková', 'Králová', 'Růžičková', 'Benešová', 'Fialová', 'Sedláčková', 'Doležalová'];

const SOURCES = ['web', 'doporučení', 'sreality', 'bezrealitky', 'facebook', 'telefon', 'instagram', 'idnes'];
const CLIENT_TYPES = ['buyer', 'seller', 'investor', 'buyer', 'buyer', 'seller'];
const CITIES = ['Praha', 'Praha', 'Praha', 'Praha', 'Brno', 'Brno', 'Ostrava', 'Plzeň', 'Liberec', 'Olomouc'];
const DISTRICTS = ['Vinohrady', 'Karlín', 'Smíchov', 'Dejvice', 'Holešovice', 'Žižkov', 'Nusle', 'Vršovice', 'Letná', 'Bubeneč', 'Střešovice', 'Břevnov', 'Podolí'];
const ROOMS = ['1+kk', '1+1', '2+kk', '2+1', '3+kk', '3+1', '4+kk', '4+1', '5+kk'];
const LEAD_STATUSES = ['new', 'new', 'new', 'contacted', 'contacted', 'viewing_scheduled', 'viewing_scheduled', 'offer_sent', 'negotiation', 'closed_won', 'closed_lost'];
const EVENT_TYPE_MAP = { prohlídka: 'viewing', schůzka: 'meeting', hovor: 'call', deadline: 'deadline', interní: 'internal' };
const LEAD_NOTES = [
  'Klient hledá byt pro rodinu, preferuje blízko školy.',
  'Investor – zajímá se o výnos z pronájmu.',
  'Preferuje novostavbu s parkováním.',
  'Chce byt s balkonem a výtahem.',
  'Prodává rodinný dům, stěhuje se do Prahy.',
  'Hledá komerční prostor pro kancelář.',
  'Zajímá se o pozemek pro stavbu.',
  'Chce byt v centru, maximálně 3+kk.',
  'Potřebuje rychle prodat, stěhování do zahraničí.',
  'Hledá investiční byt pod 5 mil.',
  'Preferuje garsonku nebo 1+kk v Praze.',
  'Rodina s dětmi, hledá 4+kk se zahradou.',
  'Má schválenou hypotéku do 8 mil.',
  'Zajímá se o starší byt k rekonstrukci.',
  'Prodej bytu po rodičích, chce rychlý odhad.',
];
const EVENT_TYPES = ['prohlídka', 'prohlídka', 'prohlídka', 'schůzka', 'schůzka', 'hovor', 'deadline', 'interní'];

async function getIds(table, limit = 50) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=${limit}`, { headers });
  if (!res.ok) return [];
  return (await res.json()).map(r => r.id);
}

async function main() {
  console.log('Fetching existing IDs...');
  const propertyIds = await getIds('properties');
  const agentIds = await getIds('agents', 10);
  const fallbackAgent = agentIds[0] || 'a1000000-0000-0000-0000-000000000001';
  console.log(`  ${propertyIds.length} properties, ${agentIds.length} agents`);

  // ── CLIENTS (60 new) ──
  console.log('\nSeeding clients...');
  const newClientIds = [];
  const dateRanges = [
    { start: new Date('2025-06-01'), end: new Date('2025-09-30'), count: 8 },
    { start: new Date('2025-10-01'), end: new Date('2025-12-31'), count: 15 },
    { start: new Date('2026-01-01'), end: new Date('2026-01-31'), count: 12 },
    { start: new Date('2026-02-01'), end: new Date('2026-02-28'), count: 12 },
    { start: new Date('2026-03-01'), end: new Date('2026-03-25'), count: 13 },
  ];

  let clientNum = 2000;
  for (const range of dateRanges) {
    for (let i = 0; i < range.count; i++) {
      const isMale = Math.random() > 0.5;
      const first = pick(isMale ? FIRST_M : FIRST_F);
      const last = pick(isMale ? LAST_M : LAST_F);
      const city = pick(CITIES);
      const ctype = pick(CLIENT_TYPES);
      const budgetMin = ctype === 'seller' ? null : (2_000_000 + Math.floor(Math.random() * 5_000_000));
      const budgetMax = budgetMin != null ? budgetMin + 2_000_000 + Math.floor(Math.random() * 8_000_000) : null;
      const createdAt = randomDate(range.start, range.end).toISOString();
      const id = uuid('c2000000', ++clientNum);

      const nameNorm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      const row = {
        id,
        name: `${first} ${last}`,
        email: `${nameNorm(first)}.${nameNorm(last)}${clientNum}@example.cz`,
        phone: `+420 ${600 + Math.floor(Math.random() * 100)} ${String(Math.floor(Math.random() * 1000)).padStart(3, '0')} ${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
        type: ctype,
        budget_min: budgetMin,
        budget_max: budgetMax,
        preferred_cities: [city],
        preferred_districts: city === 'Praha' ? [pick(DISTRICTS), pick(DISTRICTS)] : [],
        preferred_rooms: [pick(ROOMS), pick(ROOMS)],
        preferred_type: pick(['byt', 'byt', 'byt', 'dům', 'komerční', null]),
        notes: pick(LEAD_NOTES),
        agent_id: pick(agentIds.length > 0 ? agentIds : [fallbackAgent]),
        created_at: createdAt,
        updated_at: createdAt,
      };

      const result = await insert('clients', row);
      if (result) newClientIds.push(id);
      process.stdout.write('.');
    }
  }
  console.log(`\n  Inserted ${newClientIds.length} clients`);

  const allClientIds = await getIds('clients', 200);
  console.log(`  Total clients: ${allClientIds.length}`);

  // ── LEADS (150 new) ──
  console.log('\nSeeding leads...');
  let leadCount = 0;
  const leadMonths = [
    { start: new Date('2025-10-01'), end: new Date('2025-10-31'), count: 18 },
    { start: new Date('2025-11-01'), end: new Date('2025-11-30'), count: 22 },
    { start: new Date('2025-12-01'), end: new Date('2025-12-31'), count: 20 },
    { start: new Date('2026-01-01'), end: new Date('2026-01-31'), count: 28 },
    { start: new Date('2026-02-01'), end: new Date('2026-02-28'), count: 32 },
    { start: new Date('2026-03-01'), end: new Date('2026-03-25'), count: 30 },
  ];

  for (const range of leadMonths) {
    for (let i = 0; i < range.count; i++) {
      const createdAt = randomDate(range.start, range.end).toISOString();
      const status = pick(LEAD_STATUSES);

      const row = {
        client_id: pick(allClientIds),
        property_id: pick(propertyIds),
        status,
        source: pick(SOURCES),
        notes: pick(LEAD_NOTES),
        next_action: status === 'new' ? 'Kontaktovat'
          : status === 'contacted' ? 'Naplánovat prohlídku'
          : status === 'viewing_scheduled' ? 'Prohlídka'
          : status === 'offer_sent' ? 'Čekat na odpověď'
          : null,
        next_action_date: (status !== 'closed_won' && status !== 'closed_lost')
          ? new Date(new Date(createdAt).getTime() + Math.random() * 7 * 86400000).toISOString()
          : null,
        created_at: createdAt,
        updated_at: createdAt,
      };

      const result = await insert('leads', row);
      if (result) leadCount++;
      process.stdout.write('.');
    }
  }
  console.log(`\n  Inserted ${leadCount} leads`);

  // ── SALES (40 new) ──
  console.log('\nSeeding sales...');
  let saleCount = 0;
  const saleMonths = [
    { start: new Date('2025-10-01'), end: new Date('2025-10-31'), count: 5 },
    { start: new Date('2025-11-01'), end: new Date('2025-11-30'), count: 6 },
    { start: new Date('2025-12-01'), end: new Date('2025-12-31'), count: 5 },
    { start: new Date('2026-01-01'), end: new Date('2026-01-31'), count: 8 },
    { start: new Date('2026-02-01'), end: new Date('2026-02-28'), count: 9 },
    { start: new Date('2026-03-01'), end: new Date('2026-03-25'), count: 7 },
  ];

  for (const range of saleMonths) {
    for (let i = 0; i < range.count; i++) {
      const closedAt = randomDate(range.start, range.end).toISOString();
      const contractAt = new Date(new Date(closedAt).getTime() - Math.random() * 14 * 86400000).toISOString();
      const salePrice = 2_000_000 + Math.floor(Math.random() * 18_000_000);
      const pct = 2 + Math.random() * 3; // 2-5%

      const row = {
        property_id: pick(propertyIds),
        client_id: pick(allClientIds),
        agent_id: pick(agentIds.length > 0 ? agentIds : [fallbackAgent]),
        sale_price: salePrice,
        commission: Math.round(salePrice * pct / 100),
        commission_pct: Math.round(pct * 10) / 10,
        contract_signed_at: contractAt,
        closed_at: closedAt,
        notes: pick(['Hladký průběh', 'Složitější jednání, ale úspěšné', 'Rychlý prodej', 'Klient velmi spokojený', 'Hypotéka schválena bez problémů', null]),
        created_at: closedAt,
      };

      const result = await insert('sales', row);
      if (result) saleCount++;
      process.stdout.write('.');
    }
  }
  console.log(`\n  Inserted ${saleCount} sales`);

  // ── CALENDAR EVENTS (25 new) ──
  console.log('\nSeeding calendar events...');
  let eventCount = 0;
  const now = new Date();

  for (let i = 0; i < 25; i++) {
    const daysOffset = -7 + Math.floor(Math.random() * 21);
    const hour = pick([9, 10, 11, 13, 14, 15, 16]);
    const startAt = new Date(now);
    startAt.setDate(startAt.getDate() + daysOffset);
    startAt.setHours(hour, pick([0, 0, 30]), 0, 0);

    const evTypeKey = pick(EVENT_TYPES);
    const evType = EVENT_TYPE_MAP[evTypeKey] || 'meeting';
    const propTitle = pick(['Byt 3+kk Vinohrady', 'Byt 2+1 Karlín', 'RD Černošice', 'Byt 1+kk Holešovice', 'Byt 4+kk Dejvice']);
    const clientName = `${pick([...FIRST_M, ...FIRST_F])} ${pick([...LAST_M, ...LAST_F])}`;
    const endAt = new Date(startAt.getTime() + 60 * 60 * 1000); // +1hr

    const titles = {
      viewing: `Prohlídka: ${propTitle} — ${clientName}`,
      meeting: `Schůzka s ${clientName}`,
      call: `Telefonát: ${clientName}`,
      deadline: `Deadline: Smlouva ${propTitle}`,
      internal: `Interní porada — týdenní review`,
    };

    const locations = {
      viewing: pick(['Vinohradská 42', 'Karlínské nám. 8', 'Holešovická 15', 'Na Příkopě 22']),
      meeting: pick(['Kancelář Reality Monitor', 'Kavárna Café Louvre', 'Online (Teams)']),
      call: null,
      deadline: 'Kancelář',
      internal: 'Kancelář Reality Monitor',
    };

    const row = {
      title: titles[evType] || `Událost — ${clientName}`,
      type: evType,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      location: locations[evType] || null,
      notes: evType === 'viewing' ? 'Připravit klíče a podklady' : evType === 'meeting' ? 'Připravit nabídku' : null,
      client_id: pick(allClientIds),
      property_id: evType === 'viewing' ? pick(propertyIds) : null,
      agent_id: pick(agentIds.length > 0 ? agentIds : [fallbackAgent]),
      completed: false,
      created_at: new Date().toISOString(),
    };

    const result = await insert('calendar_events', row);
    if (result) eventCount++;
    process.stdout.write('.');
  }
  console.log(`\n  Inserted ${eventCount} events`);

  console.log('\n=== DONE ===');
  console.log(`  Clients: +${newClientIds.length}`);
  console.log(`  Leads: +${leadCount}`);
  console.log(`  Sales: +${saleCount}`);
  console.log(`  Events: +${eventCount}`);
}

main().catch(console.error);
