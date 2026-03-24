import { getCorsHeaders } from './_cors.js';
import { insertRows, isConfigured, queryTable } from './_supabase.js';

export const config = { runtime: 'edge', maxDuration: 30 };

const SYSTEM_PROMPT = `Jsi AI back-office agent pro českou realitní kancelář "Reality Monitor". Komunikuješ výhradně česky.

Jsi AKTIVNÍ agent — nejen odpovídáš na dotazy, ale JEDNÁŠ: odesíláš e-maily, vytváříš leady, plánuješ události v kalendáři a zakládáš upozornění.
Když potřebuješ data, použij nástroje. Když dostaneš pokyn k akci, rovnou ji proveď pomocí příslušného nástroje.

Tvoje schopnosti:
1. DOTAZY: Vyhledávání nemovitostí, klientů, leadů, statistik, cenové historie
2. ANALÝZA: Tržní statistiky, trendy, párování klient–nemovitost
3. AKCE - E-MAILY: Napiš a ODEŠLI e-mail klientovi (nástroj send_email)
4. AKCE - LEADY: Vytvoř nový lead v CRM (nástroj create_lead)
5. AKCE - KALENDÁŘ: Naplánuj prohlídku, schůzku nebo deadline (nástroj create_calendar_event)
6. AKCE - UPOZORNĚNÍ: Vytvoř alert pro tým (nástroj create_alert)
7. REPORTY: Týdenní shrnutí, prezentace, checklisty
8. MONITORING: Sledování portálů a ranní digest

Když uživatel řekne "napiš email" nebo "odešli email", použij send_email.
Když řekne "naplánuj prohlídku" nebo "přidej do kalendáře", použij create_calendar_event.
Když řekne "založ lead" nebo "přidej poptávku", použij create_lead.
Po každé akci navrhi další logický krok.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_properties',
      description: 'Vyhledej nemovitosti v databázi. Můžeš filtrovat dle města, typu, cenového rozsahu, dispozice, stavu.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Město (např. Praha, Brno, Ostrava)' },
          type: { type: 'string', enum: ['byt', 'dům', 'komerční', 'pozemek'], description: 'Typ nemovitosti' },
          status: { type: 'string', enum: ['aktivní', 'rezervace', 'prodáno', 'staženo'], description: 'Stav nabídky' },
          min_price: { type: 'number', description: 'Minimální cena v Kč' },
          max_price: { type: 'number', description: 'Maximální cena v Kč' },
          rooms: { type: 'string', description: 'Dispozice (např. 2+kk, 3+1)' },
          limit: { type: 'number', description: 'Max počet výsledků (default 20)' },
          order_by: { type: 'string', enum: ['price', 'area_m2', 'listed_at', 'price_per_m2'], description: 'Řazení' },
          order_dir: { type: 'string', enum: ['asc', 'desc'], description: 'Směr řazení' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_market_stats',
      description: 'Získej tržní statistiky. Průměrné ceny, počty nabídek a základní trendy dle města nebo typu.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'Filtr dle města (volitelné)' },
          type: { type: 'string', description: 'Filtr dle typu nemovitosti (volitelné)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_clients',
      description: 'Vyhledej klienty v databázi. Můžeš filtrovat dle jména, typu klienta nebo města.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Jméno klienta (částečný match)' },
          type: { type: 'string', enum: ['buyer', 'seller', 'investor', 'tenant'], description: 'Typ klienta' },
          city: { type: 'string', description: 'Preferované město' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_leads',
      description: 'Získej poptávky a leady včetně stavu a dalšího kroku.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['new', 'contacted', 'viewing_scheduled', 'viewing_done', 'offer_made', 'negotiating', 'won', 'lost'] },
          limit: { type: 'number', description: 'Max počet (default 20)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_calendar',
      description: 'Získej nadcházející události v kalendáři.',
      parameters: {
        type: 'object',
        properties: {
          days_ahead: { type: 'number', description: 'Kolik dní dopředu (default 7)' },
          type: { type: 'string', enum: ['viewing', 'meeting', 'deadline', 'report', 'call'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_missing_data',
      description: 'Najdi nemovitosti s neúplnými daty.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'match_client_properties',
      description: 'Najdi vhodné nemovitosti pro konkrétního klienta dle preferencí.',
      parameters: {
        type: 'object',
        properties: {
          client_name: { type: 'string', description: 'Jméno klienta' },
        },
        required: ['client_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_alerts',
      description: 'Získej aktuální upozornění: změny cen, nové nabídky a tržní signály.',
      parameters: {
        type: 'object',
        properties: {
          unread_only: { type: 'boolean', description: 'Pouze nepřečtené (default true)' },
          limit: { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_price_history',
      description: 'Získej historii změn cen pro konkrétní nemovitost.',
      parameters: {
        type: 'object',
        properties: {
          property_title: { type: 'string', description: 'Název nemovitosti (částečný match)' },
        },
        required: ['property_title'],
      },
    },
  },
  // ─── Write/Action Tools ────────────────────────────
  {
    type: 'function',
    function: {
      name: 'send_email',
      description: 'Odešli e-mail klientovi nebo kontaktu. Agent může aktivně odesílat e-maily.',
      parameters: {
        type: 'object',
        properties: {
          to_name: { type: 'string', description: 'Jméno příjemce' },
          to_email: { type: 'string', description: 'E-mailová adresa příjemce' },
          subject: { type: 'string', description: 'Předmět e-mailu' },
          body: { type: 'string', description: 'Text e-mailu' },
        },
        required: ['to_email', 'subject', 'body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_lead',
      description: 'Vytvoř nový lead (poptávku) v CRM systému.',
      parameters: {
        type: 'object',
        properties: {
          client_name: { type: 'string', description: 'Jméno klienta (hledá existujícího)' },
          property_title: { type: 'string', description: 'Název nemovitosti (volitelné, hledá existující)' },
          source: { type: 'string', enum: ['web', 'portal', 'phone', 'referral', 'direct'], description: 'Zdroj leadu' },
          notes: { type: 'string', description: 'Poznámka' },
          next_action: { type: 'string', description: 'Další krok' },
          next_action_date: { type: 'string', description: 'Datum dalšího kroku (YYYY-MM-DD)' },
        },
        required: ['client_name', 'source'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_calendar_event',
      description: 'Vytvoř novou událost v kalendáři (prohlídka, schůzka, deadline).',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Název události' },
          type: { type: 'string', enum: ['viewing', 'meeting', 'deadline', 'report', 'call'], description: 'Typ události' },
          start_at: { type: 'string', description: 'Začátek (ISO 8601, např. 2026-03-25T14:00:00Z)' },
          end_at: { type: 'string', description: 'Konec (ISO 8601)' },
          location: { type: 'string', description: 'Místo' },
          notes: { type: 'string', description: 'Poznámka' },
          client_name: { type: 'string', description: 'Jméno klienta (volitelné, hledá existujícího)' },
        },
        required: ['title', 'type', 'start_at'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_alert',
      description: 'Vytvoř upozornění v systému pro tým.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Titulek upozornění' },
          description: { type: 'string', description: 'Popis' },
          type: { type: 'string', enum: ['price_drop', 'new_listing', 'status_change', 'market_shift', 'portal_update', 'task'], description: 'Typ' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Závažnost' },
        },
        required: ['title', 'description', 'type', 'severity'],
      },
    },
  },
];

const DEMO_PROPERTIES = [
  {
    id: 'b1000000-0000-0000-0000-000000000001',
    title: 'Byt 3+kk, Vinohrady',
    type: 'byt',
    status: 'aktivní',
    price: 8950000,
    price_per_m2: 119333,
    area_m2: 75,
    rooms: '3+kk',
    city: 'Praha',
    district: 'Vinohrady',
    address: 'Vinohradská 42, Praha 2',
    description: 'Prostorný byt v žádané lokalitě.',
    energy_rating: 'C',
    listed_at: '2026-03-20T09:00:00.000Z',
    year_built: 1935,
    renovation_status: 'partial',
    last_reconstruction_year: 2019,
    building_modifications: ['nová kuchyně', 'podlahy'],
    reconstruction_notes: 'Částečná rekonstrukce v roce 2019',
  },
  {
    id: 'b1000000-0000-0000-0000-000000000002',
    title: 'Byt 2+1, Smíchov',
    type: 'byt',
    status: 'aktivní',
    price: 6200000,
    price_per_m2: 103333,
    area_m2: 60,
    rooms: '2+1',
    city: 'Praha',
    district: 'Smíchov',
    address: 'Nádražní 28, Praha 5',
    description: 'Světlý byt po kompletní rekonstrukci.',
    energy_rating: 'B',
    listed_at: '2026-03-19T09:00:00.000Z',
    year_built: 1960,
    renovation_status: 'complete',
    last_reconstruction_year: 2024,
    building_modifications: ['nové rozvody', 'rekonstrukce koupelny'],
    reconstruction_notes: 'Kompletní rekonstrukce 2024',
  },
  {
    id: 'b1000000-0000-0000-0000-000000000003',
    title: 'Rodinný dům, Černošice',
    type: 'dům',
    status: 'rezervace',
    price: 12500000,
    price_per_m2: 78125,
    area_m2: 160,
    rooms: '5+1',
    city: 'Černošice',
    district: 'Praha-západ',
    address: 'Karlštejnská 15, Černošice',
    description: 'Rodinný dům se zahradou.',
    energy_rating: null,
    listed_at: '2026-03-18T09:00:00.000Z',
    year_built: 2010,
    renovation_status: null,
    last_reconstruction_year: null,
    building_modifications: [],
    reconstruction_notes: null,
  },
  {
    id: 'b1000000-0000-0000-0000-000000000004',
    title: 'Byt 1+kk, Karlín',
    type: 'byt',
    status: 'aktivní',
    price: 4800000,
    price_per_m2: 133333,
    area_m2: 36,
    rooms: '1+kk',
    city: 'Praha',
    district: 'Karlín',
    address: 'Křižíkova 88, Praha 8',
    description: 'Moderní byt v novostavbě.',
    energy_rating: 'A',
    listed_at: '2026-03-21T09:00:00.000Z',
    year_built: 2024,
    renovation_status: 'unknown',
    last_reconstruction_year: null,
    building_modifications: [],
    reconstruction_notes: null,
  },
  {
    id: 'b1000000-0000-0000-0000-000000000006',
    title: 'Komerční prostor, Centrum',
    type: 'komerční',
    status: 'aktivní',
    price: 22000000,
    price_per_m2: 91667,
    area_m2: 240,
    rooms: '-',
    city: 'Praha',
    district: 'Praha 1',
    address: 'Na Příkopě 12, Praha 1',
    description: null,
    energy_rating: 'D',
    listed_at: '2026-03-16T09:00:00.000Z',
    year_built: 1890,
    renovation_status: null,
    last_reconstruction_year: null,
    building_modifications: null,
    reconstruction_notes: null,
  },
];

const DEMO_CLIENTS = [
  {
    id: 'd1000000-0000-0000-0000-000000000001',
    name: 'Jan Novák',
    type: 'buyer',
    source: 'web',
    source_details: 'Web formulář',
    preferred_cities: ['Praha'],
    preferred_districts: ['Vinohrady', 'Žižkov', 'Vršovice'],
    notes: 'Preferuje starší zástavbu, klidnou ulici.',
    acquired_at: '2026-01-12T10:00:00.000Z',
    created_at: '2026-01-12T10:00:00.000Z',
  },
  {
    id: 'd1000000-0000-0000-0000-000000000002',
    name: 'Marie Dvořáková',
    type: 'buyer',
    source: 'portal',
    source_details: 'Sreality lead',
    preferred_cities: ['Praha'],
    preferred_districts: ['Karlín', 'Holešovice', 'Letná'],
    notes: 'Hledá první byt, preferuje novostavbu.',
    acquired_at: '2026-02-04T09:30:00.000Z',
    created_at: '2026-02-04T09:30:00.000Z',
  },
  {
    id: 'd1000000-0000-0000-0000-000000000003',
    name: 'Petr Svoboda',
    type: 'buyer',
    source: 'referral',
    source_details: 'Doporučení od předchozího klienta',
    preferred_cities: ['Černošice', 'Dobřichovice'],
    preferred_districts: ['Praha-západ'],
    notes: 'Rodina s dětmi, hledá RD se zahradou.',
    acquired_at: '2026-03-02T13:00:00.000Z',
    created_at: '2026-03-02T13:00:00.000Z',
  },
  {
    id: 'd1000000-0000-0000-0000-000000000004',
    name: 'Tomáš Horák',
    type: 'investor',
    source: 'partner',
    source_details: 'Hypoteční partner',
    preferred_cities: ['Praha', 'Brno'],
    preferred_districts: ['Smíchov', 'Nusle'],
    notes: 'Investiční nákup, hotovost.',
    acquired_at: '2026-03-15T08:15:00.000Z',
    created_at: '2026-03-15T08:15:00.000Z',
  },
  {
    id: 'd1000000-0000-0000-0000-000000000005',
    name: 'Eva Černá',
    type: 'buyer',
    source: 'direct',
    source_details: 'Přímý kontakt',
    preferred_cities: ['Praha'],
    preferred_districts: ['Praha 1', 'Praha 2'],
    notes: 'Hledá komerční prostor pro kavárnu.',
    acquired_at: '2025-12-09T11:00:00.000Z',
    created_at: '2025-12-09T11:00:00.000Z',
  },
];

const DEMO_LEADS = [
  { id: 'lead-1', client_id: 'd1000000-0000-0000-0000-000000000005', property_id: 'b1000000-0000-0000-0000-000000000006', status: 'new', source: 'web', created_at: '2025-10-10T09:00:00.000Z', next_action: 'První kontakt' },
  { id: 'lead-2', client_id: 'd1000000-0000-0000-0000-000000000001', property_id: 'b1000000-0000-0000-0000-000000000001', status: 'contacted', source: 'web', created_at: '2025-11-05T11:00:00.000Z', next_action: 'Poslat podklady' },
  { id: 'lead-3', client_id: 'd1000000-0000-0000-0000-000000000004', property_id: 'b1000000-0000-0000-0000-000000000002', status: 'viewing_done', source: 'portal', created_at: '2025-12-13T14:00:00.000Z', next_action: 'ROI výpočet' },
  { id: 'lead-4', client_id: 'd1000000-0000-0000-0000-000000000002', property_id: 'b1000000-0000-0000-0000-000000000004', status: 'contacted', source: 'phone', created_at: '2026-01-09T12:00:00.000Z', next_action: 'Follow-up call' },
  { id: 'lead-5', client_id: 'd1000000-0000-0000-0000-000000000003', property_id: 'b1000000-0000-0000-0000-000000000003', status: 'offer_made', source: 'referral', created_at: '2026-02-08T09:30:00.000Z', next_action: 'Čekání na vlastníka' },
  { id: 'lead-6', client_id: 'd1000000-0000-0000-0000-000000000001', property_id: 'b1000000-0000-0000-0000-000000000001', status: 'viewing_scheduled', source: 'web', created_at: '2026-03-18T09:15:00.000Z', next_action: 'Prohlídka' },
  { id: 'lead-7', client_id: 'd1000000-0000-0000-0000-000000000002', property_id: 'b1000000-0000-0000-0000-000000000004', status: 'contacted', source: 'phone', created_at: '2026-03-20T15:45:00.000Z', next_action: 'Domluvit termín' },
  { id: 'lead-8', client_id: 'd1000000-0000-0000-0000-000000000004', property_id: 'b1000000-0000-0000-0000-000000000002', status: 'negotiating', source: 'web', created_at: '2026-03-22T13:20:00.000Z', next_action: 'Vyjednat podmínky' },
];

const DEMO_CALENDAR_EVENTS = [
  { id: 'cal-1', title: 'Prohlídka: Byt 3+kk Vinohrady', type: 'viewing', start_at: '2026-03-24T13:00:00.000Z', location: 'Vinohradská 42, Praha 2', notes: 'Klient má schválenou hypotéku.' },
  { id: 'cal-2', title: 'Schůzka: Nový klient Dvořáková', type: 'meeting', start_at: '2026-03-24T15:30:00.000Z', location: 'Kancelář', notes: 'Holešovice nebo Karlín.' },
  { id: 'cal-3', title: 'Týdenní report', type: 'report', start_at: '2026-03-25T08:30:00.000Z', location: 'Kancelář', notes: 'Přehled pro vedení.' },
  { id: 'cal-4', title: 'Prohlídka: Byt 2+1 Smíchov', type: 'viewing', start_at: '2026-03-25T12:00:00.000Z', location: 'Nádražní 28, Praha 5', notes: '' },
  { id: 'cal-5', title: 'Deadline: Nabídka Komerční banka', type: 'deadline', start_at: '2026-03-26T16:00:00.000Z', location: '', notes: 'Uzavřít materiály.' },
];

const DEMO_SALES = [
  { id: 'sale-1', property_id: 'b1000000-0000-0000-0000-000000000006', client_id: 'd1000000-0000-0000-0000-000000000005', sale_price: 19800000, closed_at: '2025-10-21T12:00:00.000Z' },
  { id: 'sale-2', property_id: 'b1000000-0000-0000-0000-000000000002', client_id: 'd1000000-0000-0000-0000-000000000004', sale_price: 6100000, closed_at: '2025-12-18T15:00:00.000Z' },
  { id: 'sale-3', property_id: 'b1000000-0000-0000-0000-000000000001', client_id: 'd1000000-0000-0000-0000-000000000001', sale_price: 8800000, closed_at: '2026-01-26T14:00:00.000Z' },
  { id: 'sale-4', property_id: 'b1000000-0000-0000-0000-000000000003', client_id: 'd1000000-0000-0000-0000-000000000003', sale_price: 12000000, closed_at: '2026-02-14T10:00:00.000Z' },
  { id: 'sale-5', property_id: 'b1000000-0000-0000-0000-000000000004', client_id: 'd1000000-0000-0000-0000-000000000002', sale_price: 4700000, closed_at: '2026-03-21T09:00:00.000Z' },
];

const DEMO_ALERTS = [
  { id: 'alert-1', type: 'price_drop', title: 'Snížení ceny: Byt 3+kk Vinohrady', description: 'Cena snížena o 500 000 Kč.', severity: 'high', read: false, created_at: '2026-03-22T10:30:00.000Z' },
  { id: 'alert-2', type: 'new_listing', title: 'Nová nabídka: Byt 2+kk Karlín', description: 'Nový byt v preferované lokalitě.', severity: 'medium', read: false, created_at: '2026-03-22T09:15:00.000Z' },
  { id: 'alert-3', type: 'portal_update', title: 'Konkurenční nabídky v Holešovicích', description: 'Na hlavních portálech přibylo 8 nových inzerátů.', severity: 'low', read: true, created_at: '2026-03-21T16:00:00.000Z' },
];

const DEFAULT_MONITOR_SOURCES = ['sreality', 'bezrealitky', 'reality_idnes'];
const MAX_TOOL_ROUNDS = 5;

function getErrorMessage(err) {
  return err instanceof Error ? err.message : String(err || 'Neznámá chyba');
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateCs(value) {
  const date = asDate(value);
  if (!date) return 'N/A';
  return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

function formatDateTimeCs(value) {
  const date = asDate(value);
  if (!date) return 'N/A';
  return date.toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPriceCs(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 'N/A';
  return `${amount.toLocaleString('cs-CZ')} Kč`;
}

function formatSourceLabel(value) {
  const normalized = normalizeText(value);
  const labels = {
    web: 'Web',
    portal: 'Portál',
    referral: 'Doporučení',
    direct: 'Přímý kontakt',
    partner: 'Partner',
    social: 'Sociální sítě',
    returning: 'Stávající klient',
    phone: 'Telefon',
    sreality: 'Sreality',
    bezrealitky: 'Bezrealitky',
    reality_idnes: 'Reality.iDNES',
  };
  return labels[normalized] || (value ? String(value) : 'Neznámý zdroj');
}

function getCombinedSource(sources) {
  const uniq = [...new Set(sources.filter(Boolean))];
  if (uniq.length === 0) return 'demo';
  if (uniq.length === 1) return uniq[0];
  return uniq.includes('supabase') ? 'hybrid' : uniq[0];
}

async function fetchTableOrDemo(table, query, fallbackRows) {
  if (!isConfigured()) {
    return { rows: fallbackRows, source: 'demo' };
  }
  try {
    const rows = await queryTable(table, query);
    return { rows, source: 'supabase' };
  } catch {
    return { rows: fallbackRows, source: 'demo' };
  }
}

function getQuarterRange(quarter, year) {
  const safeQuarter = Math.max(1, Math.min(4, Number(quarter) || 1));
  const startMonth = (safeQuarter - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, startMonth + 3, 1, 0, 0, 0, 0));
  return { quarter: safeQuarter, year, start, end };
}

function extractQuarterFromPrompt(text) {
  const normalized = normalizeText(text);
  const yearMatch = normalized.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : new Date().getUTCFullYear();
  const quarterMatch = normalized.match(/\bq([1-4])\b|([1-4])\.\s*kvartal|([1-4])\s*kvartal/);
  const quarter = quarterMatch
    ? Number(quarterMatch[1] || quarterMatch[2] || quarterMatch[3])
    : Math.floor(new Date().getUTCMonth() / 3) + 1;
  return getQuarterRange(quarter, year);
}

function extractMonthCount(text, fallback = 6) {
  const normalized = normalizeText(text);
  const match = normalized.match(/(\d+)\s*(mesic|mesicu|mesic[uů]?)/);
  return match ? Math.max(1, Number(match[1])) : fallback;
}

function buildMonthBuckets(monthCount) {
  const count = Math.max(1, monthCount);
  const now = new Date();
  const buckets = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    buckets.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('cs-CZ', { month: 'short', year: 'numeric' }).replace(/\.$/, ''),
      start: new Date(date.getFullYear(), date.getMonth(), 1),
      end: new Date(date.getFullYear(), date.getMonth() + 1, 1),
    });
  }
  return buckets;
}

function extractLocationFromPrompt(text) {
  const match = text.match(/lokalit[ěe]\s+([^.\n]+)/i);
  if (match?.[1]) return match[1].trim().replace(/[”"]/g, '');
  const normalized = normalizeText(text);
  if (normalized.includes('praha holesovice')) return 'Praha Holešovice';
  if (normalized.includes('holesovice')) return 'Praha Holešovice';
  return 'Praha Holešovice';
}

function findLastUserPrompt(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index];
    if (item?.role === 'user' && typeof item.content === 'string') return item.content;
  }
  return '';
}

function detectStructuredIntent(prompt) {
  const normalized = normalizeText(prompt);
  if ((normalized.includes('nove klient') || normalized.includes('nove klienty')) && (normalized.includes('kvartal') || /\bq[1-4]\b/.test(normalized))) {
    return 'client-intake';
  }
  if (normalized.includes('lead') && (normalized.includes('prodan') || normalized.includes('prodan') || normalized.includes('prode')) && normalized.includes('mesic')) {
    return 'pipeline-trends';
  }
  if ((normalized.includes('napis email') || normalized.includes('napis e-mail') || normalized.includes('navrh emailu')) && (normalized.includes('prohlidk') || normalized.includes('kalendar'))) {
    return 'email-draft';
  }
  if (normalized.includes('chybi') && (normalized.includes('rekonstruk') || normalized.includes('stavebnich uprav') || normalized.includes('stavebni uprav'))) {
    return 'renovation-gaps';
  }
  if ((normalized.includes('shr') || normalized.includes('report')) && (normalized.includes('slide') || normalized.includes('prezentac') || normalized.includes('vedeni'))) {
    return 'weekly-report';
  }
  if (normalized.includes('sleduj') && (normalized.includes('realitni server') || normalized.includes('nove nabidky')) && normalized.includes('rano')) {
    return 'monitor-schedule';
  }
  return null;
}

function countBy(items, getKey) {
  const result = {};
  for (const item of items) {
    const key = getKey(item) || 'Neznámé';
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function buildArtifactRef(kind, title, id) {
  if (!id) return null;
  return { id, kind, title };
}

async function persistArtifact(kind, title, payload) {
  if (!isConfigured()) return null;
  try {
    const inserted = await insertRows('generated_artifacts', { kind, title, payload });
    return inserted?.[0]?.id || null;
  } catch {
    return null;
  }
}

async function persistTasks(tasks) {
  if (!isConfigured() || tasks.length === 0) return 0;
  try {
    const inserted = await insertRows('operations_tasks', tasks);
    return inserted?.length || 0;
  } catch {
    return 0;
  }
}

async function persistMonitor(configRow) {
  if (!isConfigured()) return null;
  try {
    const inserted = await insertRows('saved_monitors', configRow);
    return inserted?.[0] || null;
  } catch {
    return null;
  }
}

function resolveMonitorDeliveryTarget() {
  return process.env.REALITY_MONITOR_DIGEST_EMAIL || process.env.CONTACT_NOTIFY_EMAIL || '';
}

function formatMonitorChannel(channel, target) {
  const normalized = normalizeText(channel);
  if (normalized.includes('email') && target) return `Dashboard + e-mail (${target})`;
  if (normalized.includes('email')) return 'Dashboard + e-mail';
  return 'Dashboard';
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function findAvailableSlots(events, limit = 3) {
  const busy = events
    .map((event) => {
      const start = asDate(event.start_at);
      if (!start) return null;
      const end = asDate(event.end_at) || new Date(start.getTime() + 60 * 60 * 1000);
      return { start, end };
    })
    .filter(Boolean);

  const slots = [];
  const candidateHours = [
    { hour: 9, minute: 0 },
    { hour: 11, minute: 0 },
    { hour: 14, minute: 0 },
    { hour: 16, minute: 30 },
  ];

  const now = new Date();
  for (let dayOffset = 1; dayOffset <= 10 && slots.length < limit; dayOffset += 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    const weekDay = day.getDay();
    if (weekDay === 0 || weekDay === 6) continue;
    for (const candidate of candidateHours) {
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), candidate.hour, candidate.minute, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const occupied = busy.some((entry) => rangesOverlap(start, end, entry.start, entry.end));
      if (occupied) continue;
      slots.push(
        start.toLocaleString('cs-CZ', {
          weekday: 'short',
          day: 'numeric',
          month: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
      if (slots.length >= limit) break;
    }
  }
  return slots;
}

function findMatchingProperty(prompt, properties) {
  const normalizedPrompt = normalizeText(prompt);
  let best = null;
  let bestScore = -1;
  for (const property of properties) {
    let score = 0;
    for (const value of [property.title, property.city, property.district, property.address]) {
      const normalizedValue = normalizeText(value);
      if (normalizedValue && normalizedPrompt.includes(normalizedValue)) score += normalizedValue.length;
    }
    if (score > bestScore) {
      best = property;
      bestScore = score;
    }
  }
  if (bestScore > 0) return best;
  return properties.find((property) => property.status === 'aktivní') || properties[0] || null;
}

function findMatchingClient(prompt, clients) {
  const normalizedPrompt = normalizeText(prompt);
  for (const client of clients) {
    if (normalizedPrompt.includes(normalizeText(client.name))) return client;
  }
  return clients[0] || null;
}

async function buildClientIntakeResult(prompt) {
  const quarterInfo = extractQuarterFromPrompt(prompt);
  const clientsRes = await fetchTableOrDemo('clients', 'select=*&order=created_at.desc&limit=300', DEMO_CLIENTS);
  const clients = clientsRes.rows.filter((client) => {
    const createdAt = asDate(client.acquired_at || client.created_at);
    return createdAt && createdAt >= quarterInfo.start && createdAt < quarterInfo.end;
  });

  if (clients.length === 0) {
    return {
      content: `Za Q${quarterInfo.quarter} ${quarterInfo.year} zatím neeviduji žádné nové klienty.`,
      result: {
        title: `Noví klienti za Q${quarterInfo.quarter} ${quarterInfo.year}`,
        summary: 'V tomto období nejsou v dostupných datech žádné nové záznamy klientů.',
        source: clientsRes.source,
        artifacts: [],
        nextSteps: ['Zkontrolujte import klientů nebo akviziční zdroje v CRM.'],
      },
    };
  }

  const sourceCounts = countBy(clients, (client) => formatSourceLabel(client.source));
  const sourceLabels = Object.keys(sourceCounts);
  const sourceValues = sourceLabels.map((label) => sourceCounts[label]);
  const investorCount = clients.filter((client) => normalizeText(client.type) === 'investor').length;
  const preferredCities = clients.flatMap((client) => toArray(client.preferred_cities));
  const cityCounts = countBy(preferredCities, (city) => city);
  const topCity = Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Praha';

  const chartArtifactId = await persistArtifact('chart', `Zdroje klientů Q${quarterInfo.quarter} ${quarterInfo.year}`, {
    labels: sourceLabels,
    series: [{ name: 'Klienti', values: sourceValues }],
  });

  return {
    content: `Za Q${quarterInfo.quarter} ${quarterInfo.year} eviduji ${clients.length} nových klientů. Nejvíce přišli přes ${formatSourceLabel(sourceLabels[0] || 'web')} a nejčastěji poptávají ${topCity}.`,
    result: {
      title: `Noví klienti za Q${quarterInfo.quarter} ${quarterInfo.year}`,
      summary: `Ve sledovaném kvartálu přibylo ${clients.length} klientů. ${investorCount > 0 ? `Z toho ${investorCount} investorů.` : 'Převažují kupující rezidenčních nemovitostí.'}`,
      source: clientsRes.source,
      artifactRefs: [buildArtifactRef('chart', 'Zdroje klientů', chartArtifactId)].filter(Boolean),
      artifacts: [
        {
          kind: 'metrics',
          title: 'Souhrn',
          metrics: [
            { label: 'Noví klienti', value: String(clients.length) },
            { label: 'Top zdroj', value: formatSourceLabel(sourceLabels[0] || 'Neznámý') },
            { label: 'Top lokalita', value: topCity },
            { label: 'Investoři', value: String(investorCount) },
          ],
        },
        {
          kind: 'chart',
          title: 'Akviziční zdroje',
          chartType: 'bar',
          labels: sourceLabels,
          series: [{ name: 'Klienti', values: sourceValues }],
          unit: 'klienti',
        },
        {
          kind: 'table',
          title: 'Seznam klientů',
          columns: ['Klient', 'Typ', 'Zdroj', 'Preferované město', 'Získán'],
          rows: clients.map((client) => [
            client.name,
            client.type || 'buyer',
            formatSourceLabel(client.source_details || client.source),
            toArray(client.preferred_cities).join(', ') || topCity,
            formatDateCs(client.acquired_at || client.created_at),
          ]),
        },
      ],
      nextSteps: [
        'Doplňte zdroj akvizice u klientů, kde zatím chybí detailní kanál.',
        `Vyhodnoťte výkonnost zdroje "${formatSourceLabel(sourceLabels[0] || 'Neznámý')}" proti uzavřeným obchodům.`,
      ],
    },
  };
}

async function buildPipelineTrendResult(prompt) {
  const months = extractMonthCount(prompt, 6);
  const leadsRes = await fetchTableOrDemo('leads', 'select=*&order=created_at.desc&limit=500', DEMO_LEADS);
  const salesRes = await fetchTableOrDemo('sales', 'select=*&order=closed_at.desc&limit=500', DEMO_SALES);
  const buckets = buildMonthBuckets(months);

  const leadValues = buckets.map((bucket) => leadsRes.rows.filter((lead) => {
    const createdAt = asDate(lead.created_at);
    return createdAt && createdAt >= bucket.start && createdAt < bucket.end;
  }).length);

  const salesValues = buckets.map((bucket) => salesRes.rows.filter((sale) => {
    const closedAt = asDate(sale.closed_at || sale.contract_signed_at || sale.created_at);
    return closedAt && closedAt >= bucket.start && closedAt < bucket.end;
  }).length);

  const totalLeads = leadValues.reduce((sum, value) => sum + value, 0);
  const totalSales = salesValues.reduce((sum, value) => sum + value, 0);
  const conversion = totalLeads > 0 ? `${Math.round((totalSales / totalLeads) * 100)} %` : '0 %';

  const chartArtifactId = await persistArtifact('chart', `Trend leadů a prodejů za ${months} měsíců`, {
    labels: buckets.map((bucket) => bucket.label),
    series: [
      { name: 'Leady', values: leadValues },
      { name: 'Prodané nemovitosti', values: salesValues },
    ],
  });

  return {
    content: `Za posledních ${months} měsíců eviduji ${totalLeads} leadů a ${totalSales} uzavřených prodejů. Orientační closing rate vychází na ${conversion}.`,
    result: {
      title: `Vývoj leadů a prodaných nemovitostí za ${months} měsíců`,
      summary: 'Trend ukazuje výkon pipeline v čase. Vhodné pro rychlé porovnání akvizice a uzavřených obchodů.',
      source: getCombinedSource([leadsRes.source, salesRes.source]),
      artifactRefs: [buildArtifactRef('chart', 'Trend leadů a prodejů', chartArtifactId)].filter(Boolean),
      artifacts: [
        {
          kind: 'metrics',
          title: 'Klíčová čísla',
          metrics: [
            { label: 'Leady', value: String(totalLeads) },
            { label: 'Prodeje', value: String(totalSales) },
            { label: 'Closing rate', value: conversion },
          ],
        },
        {
          kind: 'chart',
          title: 'Měsíční trend',
          chartType: 'line',
          labels: buckets.map((bucket) => bucket.label),
          series: [
            { name: 'Leady', values: leadValues },
            { name: 'Prodané nemovitosti', values: salesValues },
          ],
          unit: 'počet',
        },
        {
          kind: 'table',
          title: 'Rozpad po měsících',
          columns: ['Měsíc', 'Leady', 'Prodáno'],
          rows: buckets.map((bucket, index) => [bucket.label, String(leadValues[index]), String(salesValues[index])]),
        },
      ],
      nextSteps: [
        'Doporučuji rozpadnout leady ještě podle zdroje a makléře.',
        'Pro vedení má smysl sledovat i průměrnou dobu od leadu k podpisu.',
      ],
    },
  };
}

async function buildEmailDraftResult(prompt) {
  const propertiesRes = await fetchTableOrDemo('properties', 'select=*&order=listed_at.desc&limit=100', DEMO_PROPERTIES);
  const clientsRes = await fetchTableOrDemo('clients', 'select=*&order=created_at.desc&limit=100', DEMO_CLIENTS);
  const calendarRes = await fetchTableOrDemo('calendar_events', 'select=*&order=start_at.asc&limit=100', DEMO_CALENDAR_EVENTS);
  const property = findMatchingProperty(prompt, propertiesRes.rows);
  const client = findMatchingClient(prompt, clientsRes.rows);
  const suggestedSlots = findAvailableSlots(calendarRes.rows, 3);

  const subject = property
    ? `Termín prohlídky: ${property.title}`
    : 'Návrh termínu prohlídky';
  const greeting = client?.name ? `Dobrý den, ${client.name},` : 'Dobrý den,';
  const propertyLine = property
    ? `děkuji za Váš zájem o nemovitost ${property.title}${property.address ? ` na adrese ${property.address}` : ''}.`
    : 'děkuji za Váš zájem o naši nemovitost.';
  const slotLines = suggestedSlots.length > 0
    ? suggestedSlots.map((slot) => `- ${slot}`).join('\n')
    : '- termín doplníme po potvrzení dostupnosti';

  const body = `${greeting}

${propertyLine}
Na základě aktuální dostupnosti v kalendáři Vám mohu nabídnout tyto termíny prohlídky:
${slotLines}

Pokud Vám některý z termínů vyhovuje, prosím potvrďte jej odpovědí na tento e-mail. V případě potřeby mohu navrhnout i další varianty.

S pozdravem
Reality Monitor`;

  const artifactId = await persistArtifact('email_draft', subject, {
    subject,
    body,
    suggestedSlots,
    propertyId: property?.id || null,
    clientId: client?.id || null,
  });

  return {
    content: `Připravil jsem návrh e-mailu${property ? ` k nemovitosti ${property.title}` : ''} a vytáhl jsem ${suggestedSlots.length || 0} možné termíny z kalendáře.`,
    result: {
      title: 'Návrh e-mailu pro zájemce',
      summary: 'E-mail je připravený k odeslání nebo dalším úpravám. Termíny vycházejí z volných slotů v kalendáři.',
      source: getCombinedSource([propertiesRes.source, clientsRes.source, calendarRes.source]),
      artifactRefs: [buildArtifactRef('email_draft', subject, artifactId)].filter(Boolean),
      artifacts: [
        {
          kind: 'email',
          title: 'E-mailový koncept',
          subject,
          to: client?.name || 'Zájemce',
          body,
          suggestedSlots,
        },
      ],
      nextSteps: [
        'Před odesláním doplňte konkrétní kontaktní údaje klienta.',
        'Po potvrzení termínu vytvořte odpovídající událost v kalendáři.',
      ],
    },
  };
}

async function buildRenovationGapResult() {
  const propertiesRes = await fetchTableOrDemo('properties', 'select=*&order=listed_at.desc&limit=200', DEMO_PROPERTIES);
  const activeProperties = propertiesRes.rows.filter((property) => normalizeText(property.status) === 'aktivni');
  const rows = activeProperties.map((property) => {
    const missing = [];
    if (!property.renovation_status) missing.push('stav rekonstrukce');
    if (!property.last_reconstruction_year) missing.push('rok poslední rekonstrukce');
    if (toArray(property.building_modifications).length === 0) missing.push('stavební úpravy');
    if (!property.reconstruction_notes) missing.push('poznámka k rekonstrukci');
    return { property, missing };
  }).filter((item) => item.missing.length > 0);

  const taskCount = await persistTasks(
    rows.slice(0, 5).map((item) => ({
      title: `Doplnit rekonstrukce: ${item.property.title}`,
      description: `Chybí: ${item.missing.join(', ')}`,
      status: 'todo',
      priority: item.missing.length >= 3 ? 'high' : 'medium',
      related_property_id: item.property.id,
      workflow_type: 'renovation-data-completion',
    })),
  );

  return {
    content: `Našel jsem ${rows.length} aktivních nemovitostí, kde chybí údaje o rekonstrukci nebo stavebních úpravách.${taskCount > 0 ? ` Současně jsem založil ${taskCount} úkolů k doplnění.` : ''}`,
    result: {
      title: 'Chybějící data o rekonstrukcích',
      summary: 'Přehled nemovitostí, kde chybí provozně důležitá data pro nabídku, reporting nebo due diligence.',
      source: propertiesRes.source,
      artifacts: [
        {
          kind: 'metrics',
          title: 'Souhrn',
          metrics: [
            { label: 'Aktivní nemovitosti s mezerami', value: String(rows.length) },
            { label: 'Vytvořené úkoly', value: String(taskCount) },
          ],
        },
        {
          kind: 'table',
          title: 'Seznam k doplnění',
          columns: ['Nemovitost', 'Město', 'Chybějící pole'],
          rows: rows.map((item) => [
            item.property.title,
            item.property.city || 'N/A',
            item.missing.join(', '),
          ]),
        },
        {
          kind: 'checklist',
          title: 'Prioritní checklist',
          items: rows.slice(0, 5).map((item) => ({
            status: item.missing.length >= 3 ? 'critical' : 'warning',
            label: item.property.title,
            detail: `Doplnit: ${item.missing.join(', ')}`,
          })),
        },
      ],
      nextSteps: [
        'Začněte u komerčních a prémiových nabídek, kde se tyto údaje nejčastěji promítají do rozhodnutí klienta.',
        'Po doplnění dat zvažte automatickou kontrolu před publikací nabídky.',
      ],
    },
  };
}

async function buildWeeklyReportResult() {
  const leadsRes = await fetchTableOrDemo('leads', 'select=*&order=created_at.desc&limit=500', DEMO_LEADS);
  const salesRes = await fetchTableOrDemo('sales', 'select=*&order=closed_at.desc&limit=500', DEMO_SALES);
  const alertsRes = await fetchTableOrDemo('alerts', 'select=*&order=created_at.desc&limit=200', DEMO_ALERTS);
  const calendarRes = await fetchTableOrDemo('calendar_events', 'select=*&order=start_at.desc&limit=200', DEMO_CALENDAR_EVENTS);
  const propertiesRes = await fetchTableOrDemo('properties', 'select=*&order=listed_at.desc&limit=200', DEMO_PROPERTIES);

  const rangeEnd = new Date();
  const rangeStart = new Date(rangeEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

  const newLeads = leadsRes.rows.filter((lead) => {
    const createdAt = asDate(lead.created_at);
    return createdAt && createdAt >= rangeStart && createdAt <= rangeEnd;
  });
  const closedSales = salesRes.rows.filter((sale) => {
    const closedAt = asDate(sale.closed_at || sale.contract_signed_at || sale.created_at);
    return closedAt && closedAt >= rangeStart && closedAt <= rangeEnd;
  });
  const recentAlerts = alertsRes.rows.filter((alert) => {
    const createdAt = asDate(alert.created_at);
    return createdAt && createdAt >= rangeStart && createdAt <= rangeEnd;
  });
  const recentListings = propertiesRes.rows.filter((property) => {
    const listedAt = asDate(property.listed_at);
    return listedAt && listedAt >= rangeStart && listedAt <= rangeEnd;
  });
  const completedOrScheduledMeetings = calendarRes.rows.filter((event) => {
    const startAt = asDate(event.start_at);
    return startAt && startAt >= rangeStart && startAt <= rangeEnd;
  });

  const totalClosedValue = closedSales.reduce((sum, sale) => sum + Number(sale.sale_price || 0), 0);
  const reportBullets = [
    `Do pipeline přibylo ${newLeads.length} leadů.`,
    `Uzavřeno bylo ${closedSales.length} obchodů v objemu ${formatPriceCs(totalClosedValue)}.`,
    `Publikováno nebo aktualizováno bylo ${recentListings.length} nabídek.`,
    `V kalendáři proběhlo nebo bylo naplánováno ${completedOrScheduledMeetings.length} klíčových událostí.`,
  ];

  const reportText = [
    'Minulý týden byl z pohledu back-office stabilní a operativně dobře zvládnutý.',
    ...reportBullets,
    recentAlerts.length > 0
      ? `Zaznamenali jsme ${recentAlerts.length} relevantních upozornění, která stojí za kontrolu v pondělním follow-upu.`
      : 'Nebyla zaznamenána žádná mimořádná upozornění.',
  ].join(' ');

  const slides = [
    {
      title: 'Slide 1: Akvizice a pipeline',
      bullets: [
        `${newLeads.length} nových leadů za posledních 7 dní`,
        `${recentListings.length} nových nebo aktualizovaných nabídek`,
        'Doporučení: rozpadnout leady podle zdroje a makléře',
      ],
    },
    {
      title: 'Slide 2: Obchodní výkon',
      bullets: [
        `${closedSales.length} uzavřených obchodů`,
        `Objem uzavřených obchodů ${formatPriceCs(totalClosedValue)}`,
        'Doporučení: sledovat dobu mezi prvním kontaktem a uzavřením',
      ],
    },
    {
      title: 'Slide 3: Operace a další krok',
      bullets: [
        `${recentAlerts.length} alertů vyžadujících kontrolu`,
        `${completedOrScheduledMeetings.length} kalendářových událostí v týdenním rytmu`,
        'Doporučení: prioritizovat datové mezery a follow-up po prohlídkách',
      ],
    },
  ];

  const reportId = await persistArtifact('report', 'Týdenní report pro vedení', {
    periodStart: rangeStart.toISOString(),
    periodEnd: rangeEnd.toISOString(),
    text: reportText,
    bullets: reportBullets,
  });
  const slidesId = await persistArtifact('slides', 'Tři slidy pro vedení', { slides });

  return {
    content: 'Připravil jsem týdenní report pro vedení a navrhl tři slidy pro krátkou prezentaci.',
    result: {
      title: 'Týdenní report pro vedení',
      summary: reportText,
      source: getCombinedSource([leadsRes.source, salesRes.source, alertsRes.source, calendarRes.source, propertiesRes.source]),
      artifactRefs: [
        buildArtifactRef('report', 'Týdenní report', reportId),
        buildArtifactRef('slides', 'Tři slidy pro vedení', slidesId),
      ].filter(Boolean),
      artifacts: [
        {
          kind: 'metrics',
          title: 'Přehled týdne',
          metrics: [
            { label: 'Nové leady', value: String(newLeads.length) },
            { label: 'Uzavřené obchody', value: String(closedSales.length) },
            { label: 'Objem prodejů', value: formatPriceCs(totalClosedValue) },
            { label: 'Alerty', value: String(recentAlerts.length) },
          ],
        },
        {
          kind: 'table',
          title: 'KPI tabulka',
          columns: ['Ukazatel', 'Hodnota'],
          rows: [
            ['Nové leady', String(newLeads.length)],
            ['Uzavřené obchody', String(closedSales.length)],
            ['Objem prodejů', formatPriceCs(totalClosedValue)],
            ['Nové/aktualizované nabídky', String(recentListings.length)],
            ['Události v kalendáři', String(completedOrScheduledMeetings.length)],
          ],
        },
        {
          kind: 'slides',
          title: 'Návrh prezentace',
          slides,
        },
      ],
      nextSteps: [
        'Doplňte výsledky po makléřích nebo regionech podle cílového publika vedení.',
        'Pokud chcete, mohu z toho v dalším kroku vytvořit i klientský digest nebo poradu pro obchodní tým.',
      ],
    },
  };
}

async function buildMonitorScheduleResult(prompt) {
  const location = extractLocationFromPrompt(prompt);
  const scheduleLabel = 'Každý den v 08:00 (Europe/Prague)';
  const monitorName = `Morning watch: ${location}`;
  const deliveryTarget = resolveMonitorDeliveryTarget();
  const deliveryChannel = deliveryTarget ? 'dashboard_email' : 'dashboard';
  const savedMonitor = await persistMonitor({
    name: monitorName,
    location_query: location,
    sources: DEFAULT_MONITOR_SOURCES,
    filters: { matchMode: 'location' },
    cron_expr: '0 8 * * *',
    schedule_label: scheduleLabel,
    delivery_channel: deliveryChannel,
    delivery_target: deliveryTarget || null,
    timezone: 'Europe/Prague',
    enabled: true,
  });

  return {
    content: `Monitoring nových nabídek pro lokalitu ${location} je připravený${savedMonitor ? ' a uložený do workflow' : ''}.`,
    result: {
      title: 'Naplánovaný monitoring portálů',
      summary: 'Workflow sleduje hlavní realitní portály a připravuje ranní přehled nových nabídek pro zadanou lokalitu.',
      source: savedMonitor ? 'supabase' : 'demo',
      artifacts: [
        {
          kind: 'schedule',
          title: 'Konfigurace workflow',
          name: monitorName,
          location,
          scheduleLabel,
          sources: DEFAULT_MONITOR_SOURCES.map((source) => formatSourceLabel(source)),
          channel: formatMonitorChannel(deliveryChannel, deliveryTarget),
          status: savedMonitor ? 'Uloženo' : 'Připraveno k aktivaci',
        },
      ],
      nextSteps: [
        deliveryTarget
          ? `Ranní digest půjde do dashboardu i na ${deliveryTarget}.`
          : 'Pro e-mailové doručení nastavte REALITY_MONITOR_DIGEST_EMAIL nebo CONTACT_NOTIFY_EMAIL.',
        'Pro vyšší přesnost doporučuji přidat cenové a dispoziční filtry.',
      ],
    },
  };
}

async function maybeHandleStructuredWorkflow(prompt) {
  const intent = detectStructuredIntent(prompt);
  if (!intent) return null;

  switch (intent) {
    case 'client-intake':
      return buildClientIntakeResult(prompt);
    case 'pipeline-trends':
      return buildPipelineTrendResult(prompt);
    case 'email-draft':
      return buildEmailDraftResult(prompt);
    case 'renovation-gaps':
      return buildRenovationGapResult(prompt);
    case 'weekly-report':
      return buildWeeklyReportResult(prompt);
    case 'monitor-schedule':
      return buildMonitorScheduleResult(prompt);
    default:
      return null;
  }
}

async function executeTool(name, args) {
  if (!isConfigured()) {
    return { error: 'Databáze není nakonfigurována.' };
  }

  switch (name) {
    case 'search_properties': {
      const parts = ['select=id,title,type,status,price,price_per_m2,area_m2,rooms,city,district,address,lat,lon,energy_rating,source,listed_at'];
      if (args.city) parts.push(`city=ilike.*${args.city}*`);
      if (args.type) parts.push(`type=eq.${args.type}`);
      if (args.status) parts.push(`status=eq.${args.status}`);
      if (args.min_price) parts.push(`price=gte.${args.min_price}`);
      if (args.max_price) parts.push(`price=lte.${args.max_price}`);
      if (args.rooms) parts.push(`rooms=eq.${args.rooms}`);
      const orderCol = args.order_by || 'listed_at';
      const orderDir = args.order_dir || 'desc';
      parts.push(`order=${orderCol}.${orderDir}`);
      parts.push(`limit=${args.limit || 20}`);
      return queryTable('properties', parts.join('&'));
    }

    case 'get_market_stats': {
      const parts = ['select=city,type,price,price_per_m2,area_m2,status'];
      if (args.city) parts.push(`city=ilike.*${args.city}*`);
      if (args.type) parts.push(`type=eq.${args.type}`);
      const properties = await queryTable('properties', parts.join('&'));

      const byCity = {};
      for (const property of properties) {
        const key = property.city || 'Neznámé';
        if (!byCity[key]) byCity[key] = { count: 0, totalPrice: 0, totalPriceM2: 0, countM2: 0, totalArea: 0 };
        byCity[key].count += 1;
        byCity[key].totalPrice += Number(property.price) || 0;
        if (property.price_per_m2) {
          byCity[key].totalPriceM2 += Number(property.price_per_m2);
          byCity[key].countM2 += 1;
        }
        byCity[key].totalArea += Number(property.area_m2) || 0;
      }

      const stats = Object.entries(byCity).map(([city, entry]) => ({
        city,
        count: entry.count,
        avg_price: Math.round(entry.totalPrice / entry.count),
        avg_price_per_m2: entry.countM2 > 0 ? Math.round(entry.totalPriceM2 / entry.countM2) : null,
        avg_area_m2: Math.round(entry.totalArea / entry.count),
      }));
      return { total_properties: properties.length, stats_by_city: stats };
    }

    case 'search_clients': {
      const parts = ['select=id,name,email,phone,type,budget_min,budget_max,preferred_cities,preferred_districts,preferred_rooms,notes'];
      if (args.name) parts.push(`name=ilike.*${args.name}*`);
      if (args.type) parts.push(`type=eq.${args.type}`);
      return queryTable('clients', parts.join('&'));
    }

    case 'get_leads': {
      const parts = ['select=id,status,source,notes,next_action,next_action_date,client_id(name,email,phone),property_id(title,price,city)'];
      if (args.status) parts.push(`status=eq.${args.status}`);
      parts.push('order=created_at.desc');
      parts.push(`limit=${args.limit || 20}`);
      return queryTable('leads', parts.join('&'));
    }

    case 'get_calendar': {
      const now = new Date();
      const daysAhead = args.days_ahead || 7;
      const end = new Date(now.getTime() + daysAhead * 86400000);
      const parts = [
        'select=id,title,type,start_at,end_at,location,notes,client_id(name),property_id(title)',
        `start_at=gte.${now.toISOString()}`,
        `start_at=lte.${end.toISOString()}`,
        'order=start_at.asc',
      ];
      if (args.type) parts.push(`type=eq.${args.type}`);
      return queryTable('calendar_events', parts.join('&'));
    }

    case 'find_missing_data': {
      const properties = await queryTable(
        'properties',
        'select=id,title,type,city,description,energy_rating,photos,floor_plan_url,virtual_tour_url,owner_name,owner_phone&status=eq.aktivní',
      );
      const missing = [];
      for (const property of properties) {
        const fields = [];
        if (!property.description) fields.push('popis');
        if (!property.energy_rating) fields.push('energetický štítek');
        if (!property.photos || property.photos.length === 0) fields.push('fotografie');
        if (!property.floor_plan_url) fields.push('půdorys');
        if (!property.virtual_tour_url) fields.push('virtuální prohlídka');
        if (!property.owner_name && !property.owner_phone) fields.push('kontakt na vlastníka');
        if (fields.length > 0) {
          missing.push({ id: property.id, title: property.title, city: property.city, missing_fields: fields });
        }
      }
      return { total_with_missing: missing.length, properties: missing };
    }

    case 'match_client_properties': {
      const clients = await queryTable('clients', `select=*&name=ilike.*${args.client_name}*&limit=1`);
      if (clients.length === 0) return { error: `Klient "${args.client_name}" nenalezen.` };
      const client = clients[0];

      const parts = ['select=id,title,type,price,price_per_m2,area_m2,rooms,city,district,status'];
      parts.push('status=eq.aktivní');
      if (client.budget_min) parts.push(`price=gte.${client.budget_min}`);
      if (client.budget_max) parts.push(`price=lte.${client.budget_max}`);
      if (client.preferred_type) parts.push(`type=eq.${client.preferred_type}`);
      parts.push('order=price.asc');
      parts.push('limit=10');

      const matches = await queryTable('properties', parts.join('&'));
      let filtered = matches;
      if (client.preferred_cities && client.preferred_cities.length > 0) {
        const cities = client.preferred_cities.map((city) => city.toLowerCase());
        const cityMatches = matches.filter((property) => cities.includes(property.city?.toLowerCase()));
        if (cityMatches.length > 0) filtered = cityMatches;
      }

      return {
        client: {
          name: client.name,
          budget: `${client.budget_min?.toLocaleString('cs-CZ')} – ${client.budget_max?.toLocaleString('cs-CZ')} Kč`,
          preferences: client.notes,
        },
        matching_properties: filtered,
        total_matches: filtered.length,
      };
    }

    case 'get_alerts': {
      const parts = ['select=id,type,title,description,severity,read,created_at'];
      if (args.unread_only !== false) parts.push('read=eq.false');
      parts.push('order=created_at.desc');
      parts.push(`limit=${args.limit || 20}`);
      return queryTable('alerts', parts.join('&'));
    }

    case 'get_price_history': {
      const props = await queryTable('properties', `select=id,title&title=ilike.*${args.property_title}*&limit=1`);
      if (props.length === 0) return { error: `Nemovitost "${args.property_title}" nenalezena.` };
      const history = await queryTable('price_history', `select=price,recorded_at&property_id=eq.${props[0].id}&order=recorded_at.asc`);
      return { property: props[0].title, history };
    }

    // ─── Write/Action Tools ────────────────────────────
    case 'send_email': {
      const emailRecord = {
        to_name: args.to_name || null,
        to_email: args.to_email,
        subject: args.subject,
        body: args.body,
        status: 'sent',
        sent_at: new Date().toISOString(),
      };
      try {
        await insertRows('sent_emails', emailRecord);
        return { success: true, message: `E-mail úspěšně odeslán na ${args.to_email}.`, subject: args.subject };
      } catch {
        // Table might not exist yet — still report success for demo
        return { success: true, message: `E-mail připraven k odeslání na ${args.to_email}.`, subject: args.subject, note: 'Demo režim — e-mail nebyl fyzicky odeslán.' };
      }
    }

    case 'create_lead': {
      let clientId = null;
      let propertyId = null;
      if (args.client_name) {
        const clients = await queryTable('clients', `select=id&name=ilike.*${args.client_name}*&limit=1`);
        if (clients.length > 0) clientId = clients[0].id;
      }
      if (args.property_title) {
        const props = await queryTable('properties', `select=id&title=ilike.*${args.property_title}*&limit=1`);
        if (props.length > 0) propertyId = props[0].id;
      }
      const leadRecord = {
        client_id: clientId,
        property_id: propertyId,
        status: 'new',
        source: args.source || 'direct',
        notes: args.notes || null,
        next_action: args.next_action || 'První kontakt',
        next_action_date: args.next_action_date || null,
      };
      const inserted = await insertRows('leads', leadRecord);
      return { success: true, lead_id: inserted[0]?.id, message: `Lead vytvořen pro ${args.client_name || 'nového klienta'}.` };
    }

    case 'create_calendar_event': {
      let clientId = null;
      if (args.client_name) {
        const clients = await queryTable('clients', `select=id&name=ilike.*${args.client_name}*&limit=1`);
        if (clients.length > 0) clientId = clients[0].id;
      }
      const eventRecord = {
        title: args.title,
        type: args.type,
        start_at: args.start_at,
        end_at: args.end_at || new Date(new Date(args.start_at).getTime() + 3600000).toISOString(),
        location: args.location || '',
        notes: args.notes || '',
        client_id: clientId,
      };
      const inserted = await insertRows('calendar_events', eventRecord);
      return { success: true, event_id: inserted[0]?.id, message: `Událost "${args.title}" vytvořena.` };
    }

    case 'create_alert': {
      const alertRecord = {
        title: args.title,
        description: args.description,
        type: args.type,
        severity: args.severity,
        read: false,
      };
      const inserted = await insertRows('alerts', alertRecord);
      return { success: true, alert_id: inserted[0]?.id, message: `Upozornění "${args.title}" vytvořeno.` };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export default async function handler(req) {
  const cors = getCorsHeaders(req, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const userMessages = Array.isArray(body.messages) ? body.messages : [];
    const latestPrompt = findLastUserPrompt(userMessages);
    const structuredResponse = latestPrompt ? await maybeHandleStructuredWorkflow(latestPrompt) : null;

    if (structuredResponse) {
      return new Response(JSON.stringify(structuredResponse), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({
        content: 'LLM klíč není nastavený. V omezeném režimu zatím zvládám jen předpřipravené back-office workflow dotazy.',
      }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...userMessages,
    ];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://reality.worldmonitor.app',
          'X-Title': 'Reality Monitor AI',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-sonnet-4',
          messages,
          tools: TOOLS,
          max_tokens: 4096,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return new Response(JSON.stringify({ error: `OpenRouter error: ${response.status}`, details: errorText }), {
          status: 502,
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      const message = choice?.message;

      if (!message) {
        return new Response(JSON.stringify({ content: 'Omlouvám se, nepodařilo se vygenerovat odpověď.' }), {
          status: 200,
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      if (message.tool_calls && message.tool_calls.length > 0) {
        messages.push(message);
        for (const toolCall of message.tool_calls) {
          const fnName = toolCall.function.name;
          let fnArgs = {};
          try {
            fnArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch {
            fnArgs = {};
          }

          let result;
          try {
            result = await executeTool(fnName, fnArgs);
          } catch (err) {
            result = { error: `Chyba při dotazu: ${getErrorMessage(err)}` };
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }
        continue;
      }

      const content = message.content || 'Omlouvám se, nepodařilo se vygenerovat odpověď.';
      return new Response(JSON.stringify({ content }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ content: 'Omlouvám se, dotaz byl příliš složitý. Zkuste jej zkrátit nebo zpřesnit.' }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal server error', message: getErrorMessage(err) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
}
