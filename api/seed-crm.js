import { getCorsHeaders } from './_cors.js';
import { isConfigured, insertRows, queryTable } from './_supabase.js';

export const config = { runtime: 'edge' };

// ─── Clients ────────────────────────────────────────────────
const CLIENTS = [
  { name: 'Jan Novák', email: 'jan.novak@email.cz', phone: '+420 602 111 222', type: 'buyer', source: 'web', source_details: 'Web formulář', budget_min: 5000000, budget_max: 10000000, preferred_cities: ['Praha'], preferred_districts: ['Vinohrady', 'Žižkov', 'Vršovice'], preferred_rooms: '3+kk', notes: 'Preferuje starší zástavbu, klidnou ulici. Schválená hypotéka u ČSOB.', acquired_at: '2026-01-12T10:00:00Z' },
  { name: 'Marie Dvořáková', email: 'marie.dvorakova@seznam.cz', phone: '+420 773 222 333', type: 'buyer', source: 'portal', source_details: 'Sreality lead', budget_min: 3500000, budget_max: 6000000, preferred_cities: ['Praha'], preferred_districts: ['Karlín', 'Holešovice', 'Letná'], preferred_rooms: '2+kk', notes: 'Hledá první byt, preferuje novostavbu. Čeká na schválení hypotéky.', acquired_at: '2026-02-04T09:30:00Z' },
  { name: 'Petr Svoboda', email: 'petr.svoboda@gmail.com', phone: '+420 608 333 444', type: 'buyer', source: 'referral', source_details: 'Doporučení od J. Nováka', budget_min: 10000000, budget_max: 15000000, preferred_cities: ['Praha', 'Černošice'], preferred_districts: ['Dejvice', 'Střešovice'], preferred_rooms: '4+kk', notes: 'Rodina s dětmi, hledá rodinný dům nebo velký byt. Hotovost.', acquired_at: '2026-02-15T14:00:00Z' },
  { name: 'Kateřina Veselá', email: 'k.vesela@firma.cz', phone: '+420 777 444 555', type: 'investor', source: 'direct', source_details: 'Přímý kontakt na veletrhu', budget_min: 15000000, budget_max: 30000000, preferred_cities: ['Praha', 'Brno'], preferred_districts: ['Praha 1', 'Praha 2', 'Brno-střed'], notes: 'Investorka, zajímá se o komerční prostory a byty k pronájmu. Portfolio 8 nemovitostí.', acquired_at: '2025-11-20T11:00:00Z' },
  { name: 'Tomáš Procházka', email: 'tomas.prochazka@outlook.cz', phone: '+420 604 555 666', type: 'seller', source: 'web', source_details: 'Formulář pro prodejce', budget_min: null, budget_max: null, preferred_cities: ['Praha'], notes: 'Prodává byt 2+1 na Smíchově. Stěhuje se do Brna za prací.', acquired_at: '2026-03-01T08:00:00Z' },
  { name: 'Eva Černá', email: 'eva.cerna@email.cz', phone: '+420 725 666 777', type: 'buyer', source: 'phone', source_details: 'Telefonický dotaz', budget_min: 4000000, budget_max: 7000000, preferred_cities: ['Brno'], preferred_districts: ['Brno-střed', 'Královo Pole'], preferred_rooms: '2+kk', notes: 'Studentka medicíny, hledá investiční byt v Brně. Spoluvlastnictví s rodiči.', acquired_at: '2026-01-28T16:00:00Z' },
  { name: 'Martin Horák', email: 'martin.horak@company.cz', phone: '+420 602 777 888', type: 'buyer', source: 'portal', source_details: 'Bezrealitky poptávka', budget_min: 2500000, budget_max: 4500000, preferred_cities: ['Praha'], preferred_districts: ['Prosek', 'Černý Most', 'Chodov'], preferred_rooms: '2+kk', notes: 'Mladý pár, první byt. Flexibilní ohledně lokality, důležitá dostupnost metra.', acquired_at: '2026-03-10T09:00:00Z' },
  { name: 'Lucie Králová', email: 'lucie.kralova@post.cz', phone: '+420 739 888 999', type: 'seller', source: 'referral', source_details: 'Doporučení od makléře Petra', budget_min: null, budget_max: null, preferred_cities: ['Praha'], notes: 'Prodává rodinný dům v Říčanech. Dědictví, chce rychlý prodej.', acquired_at: '2026-02-20T10:30:00Z' },
  { name: 'David Marek', email: 'david.marek@outlook.com', phone: '+420 608 999 000', type: 'investor', source: 'web', source_details: 'Newsletter signup', budget_min: 8000000, budget_max: 20000000, preferred_cities: ['Praha'], preferred_districts: ['Smíchov', 'Karlín', 'Holešovice'], notes: 'IT podnikatel, hledá 2-3 byty k pronájmu přes Airbnb. Zkušený investor.', acquired_at: '2025-12-05T13:00:00Z' },
  { name: 'Hana Marková', email: 'hana.markova@centrum.cz', phone: '+420 777 000 111', type: 'buyer', source: 'portal', source_details: 'Reality iDNES', budget_min: 6000000, budget_max: 9000000, preferred_cities: ['Praha'], preferred_districts: ['Vinohrady', 'Nusle', 'Podolí'], preferred_rooms: '3+1', notes: 'Rozvedená, hledá byt pro sebe a dceru. Důležitá škola v okolí.', acquired_at: '2026-03-15T11:00:00Z' },
  { name: 'Filip Krejčí', email: 'filip.krejci@email.cz', phone: '+420 603 111 333', type: 'buyer', source: 'web', source_details: 'Google Ads kampan', budget_min: 3000000, budget_max: 5000000, preferred_cities: ['Praha', 'Kladno'], preferred_rooms: '2+1', notes: 'Čerstvý absolvent, hledá se snoubenkou. Zvažuje i okolí Prahy.', acquired_at: '2026-03-18T14:00:00Z' },
  { name: 'Jiří Beneš', email: 'jiri.benes@firma.cz', phone: '+420 724 222 444', type: 'tenant', source: 'portal', source_details: 'Sreality pronájem', budget_min: 15000, budget_max: 25000, preferred_cities: ['Praha'], preferred_districts: ['Dejvice', 'Bubeneč'], preferred_rooms: '1+kk', notes: 'Expat z Německa, hledá pronájem na 2 roky. Firma platí nájem.', acquired_at: '2026-03-05T09:00:00Z' },
  { name: 'Alena Pokorná', email: 'alena.pokorna@post.cz', phone: '+420 605 333 555', type: 'buyer', source: 'phone', source_details: 'Studený kontakt z databáze', budget_min: 12000000, budget_max: 18000000, preferred_cities: ['Praha'], preferred_districts: ['Střešovice', 'Dejvice', 'Hanspaulka'], preferred_rooms: '5+1', notes: 'Diplomatka, reprezentativní bydlení. Preferuje vilovou zástavbu.', acquired_at: '2026-01-07T15:00:00Z' },
  { name: 'Ondřej Vlček', email: 'ondrej.vlcek@avast.com', phone: '+420 608 444 666', type: 'investor', source: 'direct', source_details: 'Networking event Startup Hub', budget_min: 20000000, budget_max: 50000000, preferred_cities: ['Praha', 'Brno'], notes: 'Angel investor, zajímá se o komerční nemovitosti a coworking prostory.', acquired_at: '2025-10-15T10:00:00Z' },
  { name: 'Simona Němcová', email: 'simona.nemcova@gmail.com', phone: '+420 739 555 777', type: 'buyer', source: 'web', source_details: 'Facebook lead', budget_min: 2000000, budget_max: 3500000, preferred_cities: ['Brno', 'Olomouc'], preferred_rooms: '1+kk', notes: 'Studentka, hledá malý byt jako investici. Rodiče pomáhají s financováním.', acquired_at: '2026-03-20T08:00:00Z' },
];

// ─── Leads (spread across 6 months for pipeline trends) ─────
const LEADS = [
  { status: 'won', source: 'web', created_at: '2025-10-10T09:00:00Z', next_action: null, notes: 'Uzavřeno - byt Vinohrady', next_action_date: null },
  { status: 'lost', source: 'portal', created_at: '2025-10-18T11:00:00Z', next_action: null, notes: 'Klient si vybral konkurenci', next_action_date: null },
  { status: 'won', source: 'referral', created_at: '2025-11-05T14:00:00Z', next_action: null, notes: 'Uzavřeno - dům Černošice', next_action_date: null },
  { status: 'contacted', source: 'web', created_at: '2025-11-12T10:00:00Z', next_action: 'Follow-up email', next_action_date: '2025-11-19' },
  { status: 'lost', source: 'phone', created_at: '2025-11-20T16:00:00Z', next_action: null, notes: 'Nereaguje na kontakt', next_action_date: null },
  { status: 'won', source: 'portal', created_at: '2025-12-02T09:00:00Z', next_action: null, notes: 'Uzavřeno - komerční prostor', next_action_date: null },
  { status: 'viewing_done', source: 'web', created_at: '2025-12-13T14:00:00Z', next_action: 'ROI výpočet', next_action_date: '2025-12-20' },
  { status: 'won', source: 'direct', created_at: '2025-12-18T11:00:00Z', next_action: null, notes: 'Investor - 2 byty Karlín', next_action_date: null },
  { status: 'contacted', source: 'portal', created_at: '2026-01-09T12:00:00Z', next_action: 'Poslat podklady', next_action_date: '2026-01-15' },
  { status: 'viewing_scheduled', source: 'web', created_at: '2026-01-15T09:30:00Z', next_action: 'Prohlídka', next_action_date: '2026-01-22' },
  { status: 'won', source: 'referral', created_at: '2026-01-20T10:00:00Z', next_action: null, notes: 'Rychlý prodej - pozemek', next_action_date: null },
  { status: 'lost', source: 'web', created_at: '2026-01-28T15:00:00Z', next_action: null, notes: 'Nesplnil podmínky hypotéky', next_action_date: null },
  { status: 'offer_made', source: 'portal', created_at: '2026-02-08T09:30:00Z', next_action: 'Čekání na vlastníka', next_action_date: '2026-02-15' },
  { status: 'contacted', source: 'phone', created_at: '2026-02-14T13:00:00Z', next_action: 'Domluvit schůzku', next_action_date: '2026-02-21' },
  { status: 'won', source: 'web', created_at: '2026-02-20T11:00:00Z', next_action: null, notes: 'Byt 1+kk Karlín - mladý pár', next_action_date: null },
  { status: 'viewing_done', source: 'direct', created_at: '2026-02-25T14:00:00Z', next_action: 'Připravit nabídku', next_action_date: '2026-03-03' },
  { status: 'new', source: 'web', created_at: '2026-03-01T08:00:00Z', next_action: 'První kontakt', next_action_date: '2026-03-03' },
  { status: 'contacted', source: 'portal', created_at: '2026-03-05T10:00:00Z', next_action: 'Poslat nabídky', next_action_date: '2026-03-10' },
  { status: 'new', source: 'phone', created_at: '2026-03-08T14:00:00Z', next_action: 'Zavolat zpět', next_action_date: '2026-03-10' },
  { status: 'viewing_scheduled', source: 'web', created_at: '2026-03-10T09:15:00Z', next_action: 'Prohlídka Vinohrady', next_action_date: '2026-03-24' },
  { status: 'contacted', source: 'portal', created_at: '2026-03-12T11:00:00Z', next_action: 'Domluvit termín', next_action_date: '2026-03-18' },
  { status: 'new', source: 'web', created_at: '2026-03-15T08:30:00Z', next_action: 'Kvalifikace leadu', next_action_date: '2026-03-17' },
  { status: 'viewing_scheduled', source: 'referral', created_at: '2026-03-17T10:00:00Z', next_action: 'Prohlídka Smíchov', next_action_date: '2026-03-25' },
  { status: 'contacted', source: 'phone', created_at: '2026-03-18T15:45:00Z', next_action: 'Follow-up', next_action_date: '2026-03-22' },
  { status: 'new', source: 'web', created_at: '2026-03-19T09:00:00Z', next_action: 'Kvalifikace', next_action_date: '2026-03-21' },
  { status: 'offer_made', source: 'web', created_at: '2026-03-19T14:00:00Z', next_action: 'Čekání na odpověď', next_action_date: '2026-03-26' },
  { status: 'negotiating', source: 'portal', created_at: '2026-03-20T13:20:00Z', next_action: 'Vyjednat podmínky', next_action_date: '2026-03-25' },
  { status: 'new', source: 'portal', created_at: '2026-03-21T08:00:00Z', next_action: 'Oslovit klienta', next_action_date: '2026-03-23' },
  { status: 'contacted', source: 'web', created_at: '2026-03-22T10:00:00Z', next_action: 'Zaslat katalog', next_action_date: '2026-03-24' },
  { status: 'new', source: 'direct', created_at: '2026-03-23T07:30:00Z', next_action: 'Osobní schůzka', next_action_date: '2026-03-25' },
];

// ─── Sales (spread across 6 months) ────────────────────────
const SALES = [
  { sale_price: 8800000, commission: 264000, closed_at: '2025-10-21T12:00:00Z', notes: 'Byt 3+kk Vinohrady' },
  { sale_price: 19800000, commission: 594000, closed_at: '2025-11-15T15:00:00Z', notes: 'Komerční prostor Praha 1' },
  { sale_price: 6100000, commission: 183000, closed_at: '2025-12-18T14:00:00Z', notes: 'Byt 2+1 Smíchov' },
  { sale_price: 3200000, commission: 96000, closed_at: '2026-01-10T10:00:00Z', notes: 'Pozemek Říčany' },
  { sale_price: 12000000, commission: 360000, closed_at: '2026-01-26T14:00:00Z', notes: 'Dům Černošice' },
  { sale_price: 4700000, commission: 141000, closed_at: '2026-02-14T10:00:00Z', notes: 'Byt 1+kk Karlín' },
  { sale_price: 15200000, commission: 456000, closed_at: '2026-02-28T09:00:00Z', notes: 'Byt 4+kk Dejvice' },
  { sale_price: 5400000, commission: 162000, closed_at: '2026-03-12T11:00:00Z', notes: 'Byt 2+kk Holešovice' },
  { sale_price: 7800000, commission: 234000, closed_at: '2026-03-21T09:00:00Z', notes: 'Byt 3+1 Nusle' },
];

// ─── Calendar Events ────────────────────────────────────────
const CALENDAR_EVENTS = [
  { title: 'Prohlídka: Byt 3+kk Vinohrady', type: 'viewing', start_at: '2026-03-24T13:00:00Z', end_at: '2026-03-24T14:00:00Z', location: 'Vinohradská 42, Praha 2', notes: 'Klient Novák, schválená hypotéka.' },
  { title: 'Schůzka: Marie Dvořáková', type: 'meeting', start_at: '2026-03-24T15:30:00Z', end_at: '2026-03-24T16:30:00Z', location: 'Kancelář Italská 8', notes: 'Karlín nebo Holešovice, novostavba.' },
  { title: 'Týdenní report pro vedení', type: 'report', start_at: '2026-03-25T08:30:00Z', end_at: '2026-03-25T09:00:00Z', location: 'Online', notes: 'Přehled KPI za minulý týden.' },
  { title: 'Prohlídka: Byt 2+1 Smíchov', type: 'viewing', start_at: '2026-03-25T12:00:00Z', end_at: '2026-03-25T13:00:00Z', location: 'Nádražní 28, Praha 5', notes: 'Klient Procházka, stávající nájemce.' },
  { title: 'Deadline: Nabídka Komerční banka', type: 'deadline', start_at: '2026-03-26T16:00:00Z', end_at: '2026-03-26T17:00:00Z', location: '', notes: 'Připravit finální materiály.' },
  { title: 'Telefonát: Filip Krejčí', type: 'call', start_at: '2026-03-24T10:00:00Z', end_at: '2026-03-24T10:30:00Z', location: '', notes: 'Nový lead, kvalifikace.' },
  { title: 'Prohlídka: Rodinný dům Černošice', type: 'viewing', start_at: '2026-03-26T10:00:00Z', end_at: '2026-03-26T11:30:00Z', location: 'Karlštejnská 15, Černošice', notes: 'Klient Svoboda + manželka.' },
  { title: 'Schůzka: Investor Veselá', type: 'meeting', start_at: '2026-03-27T14:00:00Z', end_at: '2026-03-27T15:30:00Z', location: 'Kancelář', notes: 'Analýza portfolia, nové akvizice.' },
  { title: 'Fotografování: Byt Holešovice', type: 'deadline', start_at: '2026-03-27T09:00:00Z', end_at: '2026-03-27T11:00:00Z', location: 'Argentinská 12, Praha 7', notes: 'Profesionální foto + video.' },
  { title: 'Prohlídka: Byt 2+kk Brno', type: 'viewing', start_at: '2026-03-28T10:00:00Z', end_at: '2026-03-28T11:00:00Z', location: 'Masarykova 15, Brno', notes: 'Klientka Černá, investiční byt.' },
  { title: 'Měsíční uzávěrka', type: 'report', start_at: '2026-03-31T08:00:00Z', end_at: '2026-03-31T09:00:00Z', location: 'Kancelář', notes: 'Přehled Q1 2026.' },
  { title: 'Schůzka: Vlček - coworking', type: 'meeting', start_at: '2026-03-28T14:00:00Z', end_at: '2026-03-28T15:00:00Z', location: 'WeWork Karlín', notes: 'Komerční prostor pro coworking hub.' },
  { title: 'Prohlídka: Komerční Centrum', type: 'viewing', start_at: '2026-03-26T14:00:00Z', end_at: '2026-03-26T15:30:00Z', location: 'Na Příkopě 22, Praha 1', notes: 'Investorka Veselá, retail prostor.' },
  // Past events (this week)
  { title: 'Prohlídka: Pozemek Říčany', type: 'viewing', start_at: '2026-03-21T10:00:00Z', end_at: '2026-03-21T11:30:00Z', location: 'Říčany u Prahy', notes: 'Klientka Králová, pozemek na prodej.' },
  { title: 'Schůzka: Marek - Airbnb strategie', type: 'meeting', start_at: '2026-03-22T11:00:00Z', end_at: '2026-03-22T12:00:00Z', location: 'Café Imperial', notes: 'Diskuze o nových regulacích krátkodobých pronájmů.' },
];

// ─── Alerts ─────────────────────────────────────────────────
const ALERTS = [
  { type: 'price_drop', title: 'Snížení ceny: Byt 3+kk Vinohrady', description: 'Cena snížena o 500 000 Kč (z 9 450 000 na 8 950 000 Kč). Pozice pro nákup.', severity: 'high', read: false, created_at: '2026-03-22T10:30:00Z' },
  { type: 'new_listing', title: 'Nová nabídka: Byt 2+kk Karlín', description: 'Novostavba, 52m², 5 200 000 Kč. Odpovídá preferencím 3 klientů.', severity: 'medium', read: false, created_at: '2026-03-22T09:15:00Z' },
  { type: 'portal_update', title: 'Konkurenční nabídky v Holešovicích', description: 'Na hlavních portálech přibylo 8 nových inzerátů za posledních 24h.', severity: 'low', read: true, created_at: '2026-03-21T16:00:00Z' },
  { type: 'status_change', title: 'Změna stavu: Dům Černošice → Rezervace', description: 'Nemovitost přešla do stavu "rezervace". Klient: Petr Svoboda. Záloha uhrazena.', severity: 'medium', read: false, created_at: '2026-03-22T08:45:00Z' },
  { type: 'market_shift', title: 'Tržní signál: Praha 5 - růst cen', description: 'Průměrná cena/m² v Praze 5 vzrostla o 3.2% za poslední měsíc (115 000 → 118 700 Kč/m²).', severity: 'low', read: true, created_at: '2026-03-21T14:00:00Z' },
  { type: 'price_drop', title: 'Cenový pokles: Byt 4+kk Dejvice', description: 'Vlastník snížil cenu o 800 000 Kč. Nyní 15 200 000 Kč. Vhodné pro klienta Pokornou.', severity: 'high', read: false, created_at: '2026-03-23T07:00:00Z' },
  { type: 'new_listing', title: '3 nové nabídky v Brně', description: 'Sreality: 2+kk Královo Pole (3.8M), 1+kk centrum (2.9M), 3+1 Žabovřesky (6.5M).', severity: 'medium', read: false, created_at: '2026-03-23T06:30:00Z' },
  { type: 'portal_update', title: 'Bezrealitky: Nový inzerát shodný s poptávkou', description: 'Byt 3+1, Nusle, 78m², 7 500 000 Kč — matchuje profil klientky Markové.', severity: 'high', read: false, created_at: '2026-03-23T08:15:00Z' },
  { type: 'status_change', title: 'Lead uzavřen: Byt 3+1 Nusle', description: 'Klient podepsal kupní smlouvu. Prodejní cena 7 800 000 Kč.', severity: 'medium', read: true, created_at: '2026-03-21T09:00:00Z' },
  { type: 'market_shift', title: 'ČNB: Sazba beze změny na 3.75%', description: 'Centrální banka ponechala úrokovou sazbu. Hypoteční sazby zůstávají stabilní kolem 4.5%.', severity: 'low', read: true, created_at: '2026-03-20T14:00:00Z' },
];

// ─── Price History ──────────────────────────────────────────
function buildPriceHistory(propertyTitle, startPrice, changes) {
  return changes.map(([date, price]) => ({
    property_title: propertyTitle,
    price,
    recorded_at: date,
  }));
}

const PRICE_HISTORIES = [
  ...buildPriceHistory('Byt 3+kk, Vinohrady', 9450000, [
    ['2026-01-15', 9450000], ['2026-02-01', 9450000], ['2026-02-15', 9200000], ['2026-03-01', 9200000], ['2026-03-15', 8950000], ['2026-03-22', 8950000],
  ]),
  ...buildPriceHistory('Byt 2+1, Smíchov', 5900000, [
    ['2026-01-10', 5900000], ['2026-02-01', 6000000], ['2026-02-15', 6200000], ['2026-03-01', 6200000], ['2026-03-19', 6200000],
  ]),
  ...buildPriceHistory('Rodinný dům, Černošice', 13500000, [
    ['2025-12-01', 13500000], ['2026-01-01', 13000000], ['2026-02-01', 12500000], ['2026-03-01', 12500000], ['2026-03-18', 12500000],
  ]),
  ...buildPriceHistory('Byt 1+kk, Karlín', 4800000, [
    ['2026-02-01', 4500000], ['2026-02-15', 4600000], ['2026-03-01', 4800000], ['2026-03-21', 4800000],
  ]),
  ...buildPriceHistory('Komerční prostor, Centrum', 24000000, [
    ['2025-11-01', 24000000], ['2026-01-01', 23000000], ['2026-02-01', 22500000], ['2026-03-01', 22000000], ['2026-03-16', 22000000],
  ]),
];

export default async function handler(req) {
  const cors = getCorsHeaders(req, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  if (!isConfigured()) {
    return new Response(JSON.stringify({ error: 'Supabase not configured' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const results = {};

  try {
    // 1. Seed clients
    const existingClients = await queryTable('clients', 'select=id&limit=1');
    if (existingClients.length === 0) {
      const inserted = await insertRows('clients', CLIENTS);
      results.clients = inserted.length;
    } else {
      results.clients = `skipped (${existingClients.length}+ exist)`;
    }

    // Get client IDs for foreign keys
    const allClients = await queryTable('clients', 'select=id,name&order=created_at.asc');
    const clientIds = allClients.map(c => c.id);

    // Get property IDs for foreign keys
    const allProperties = await queryTable('properties', 'select=id,title&order=listed_at.desc&limit=50');
    const propertyIds = allProperties.map(p => p.id);

    // 2. Seed leads (link to random clients and properties)
    const existingLeads = await queryTable('leads', 'select=id&limit=1');
    if (existingLeads.length === 0) {
      const leadsWithFks = LEADS.map((lead, i) => ({
        ...lead,
        client_id: clientIds[i % clientIds.length] || null,
        property_id: propertyIds[i % propertyIds.length] || null,
      }));
      const inserted = await insertRows('leads', leadsWithFks);
      results.leads = inserted.length;
    } else {
      results.leads = `skipped (${existingLeads.length}+ exist)`;
    }

    // 3. Seed sales
    const existingSales = await queryTable('sales', 'select=id&limit=1');
    if (existingSales.length === 0) {
      const salesWithFks = SALES.map((sale, i) => ({
        ...sale,
        client_id: clientIds[i % clientIds.length] || null,
        property_id: propertyIds[i % propertyIds.length] || null,
      }));
      const inserted = await insertRows('sales', salesWithFks);
      results.sales = inserted.length;
    } else {
      results.sales = `skipped (${existingSales.length}+ exist)`;
    }

    // 4. Seed calendar events
    const existingCalendar = await queryTable('calendar_events', 'select=id&limit=1');
    if (existingCalendar.length === 0) {
      const calWithFks = CALENDAR_EVENTS.map((ev, i) => ({
        ...ev,
        client_id: clientIds[i % clientIds.length] || null,
        property_id: propertyIds[i % propertyIds.length] || null,
      }));
      const inserted = await insertRows('calendar_events', calWithFks);
      results.calendar_events = inserted.length;
    } else {
      results.calendar_events = `skipped (${existingCalendar.length}+ exist)`;
    }

    // 5. Seed alerts
    const existingAlerts = await queryTable('alerts', 'select=id&limit=1');
    if (existingAlerts.length === 0) {
      const inserted = await insertRows('alerts', ALERTS);
      results.alerts = inserted.length;
    } else {
      results.alerts = `skipped (${existingAlerts.length}+ exist)`;
    }

    // 6. Seed price history
    const existingPH = await queryTable('price_history', 'select=id&limit=1');
    if (existingPH.length === 0) {
      // Match property_title to actual property IDs
      const titleToId = {};
      for (const p of allProperties) titleToId[p.title] = p.id;

      const phWithFks = PRICE_HISTORIES
        .map(ph => {
          const propId = titleToId[ph.property_title];
          if (!propId) return null;
          return { property_id: propId, price: ph.price, recorded_at: ph.recorded_at };
        })
        .filter(Boolean);

      if (phWithFks.length > 0) {
        const inserted = await insertRows('price_history', phWithFks);
        results.price_history = inserted.length;
      } else {
        results.price_history = 'no matching properties found';
      }
    } else {
      results.price_history = `skipped (${existingPH.length}+ exist)`;
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, results }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
}
