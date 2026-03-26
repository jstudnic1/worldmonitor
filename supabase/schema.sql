-- Reality Monitor — Czech Real Estate Database Schema
-- Run this in Supabase SQL Editor to create tables and seed data

-- =============================================================================
-- TABLES
-- =============================================================================

-- Agents (makléři) — must be created before properties due to FK
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Properties (nemovitosti)
CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('byt', 'dům', 'komerční', 'pozemek')),
  status TEXT NOT NULL DEFAULT 'aktivní' CHECK (status IN ('aktivní', 'rezervace', 'prodáno', 'staženo')),
  price NUMERIC NOT NULL,
  price_per_m2 NUMERIC,
  area_m2 NUMERIC NOT NULL,
  rooms TEXT,
  floor INTEGER,
  total_floors INTEGER,
  city TEXT NOT NULL,
  district TEXT NOT NULL,
  address TEXT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  description TEXT,
  energy_rating TEXT CHECK (energy_rating IN ('A', 'B', 'C', 'D', 'E', 'F', 'G')),
  has_parking BOOLEAN DEFAULT FALSE,
  has_balcony BOOLEAN DEFAULT FALSE,
  has_garden BOOLEAN DEFAULT FALSE,
  has_elevator BOOLEAN DEFAULT FALSE,
  year_built INTEGER,
  renovation_status TEXT CHECK (renovation_status IN ('original', 'partial', 'complete', 'planned', 'unknown')),
  last_reconstruction_year INTEGER,
  building_modifications TEXT[] DEFAULT '{}',
  reconstruction_notes TEXT,
  photos TEXT[] DEFAULT '{}',
  floor_plan_url TEXT,
  virtual_tour_url TEXT,
  listed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sold_at TIMESTAMPTZ,
  owner_name TEXT,
  owner_phone TEXT,
  owner_email TEXT,
  agent_id UUID REFERENCES agents(id),
  source TEXT DEFAULT 'internal',
  source_url TEXT,
  notes TEXT
);

-- Clients (klienti)
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  type TEXT NOT NULL DEFAULT 'buyer' CHECK (type IN ('buyer', 'seller', 'investor', 'tenant')),
  budget_min NUMERIC,
  budget_max NUMERIC,
  preferred_cities TEXT[] DEFAULT '{}',
  preferred_districts TEXT[] DEFAULT '{}',
  preferred_rooms TEXT[] DEFAULT '{}',
  preferred_type TEXT,
  notes TEXT,
  source TEXT DEFAULT 'unknown' CHECK (source IN ('web', 'referral', 'portal', 'social', 'direct', 'partner', 'returning', 'unknown')),
  source_details TEXT,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  agent_id UUID REFERENCES agents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Leads (poptávky)
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  property_id UUID REFERENCES properties(id),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'viewing_scheduled', 'viewing_done', 'offer_made', 'negotiating', 'won', 'lost')),
  source TEXT DEFAULT 'web',
  notes TEXT,
  next_action TEXT,
  next_action_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Calendar events (kalendář)
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('viewing', 'meeting', 'deadline', 'report', 'call')),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  location TEXT,
  client_id UUID REFERENCES clients(id),
  property_id UUID REFERENCES properties(id),
  agent_id UUID REFERENCES agents(id),
  notes TEXT,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Alerts (upozornění)
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('price_drop', 'new_listing', 'status_change', 'market_shift', 'portal_update', 'deadline')),
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('high', 'medium', 'low')),
  property_id UUID REFERENCES properties(id),
  client_id UUID REFERENCES clients(id),
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Operations tasks
CREATE TABLE IF NOT EXISTS operations_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'blocked', 'done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_at TIMESTAMPTZ,
  related_property_id UUID REFERENCES properties(id),
  related_client_id UUID REFERENCES clients(id),
  workflow_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Sales (prodeje)
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id),
  client_id UUID REFERENCES clients(id),
  agent_id UUID REFERENCES agents(id),
  sale_price NUMERIC NOT NULL,
  commission NUMERIC,
  commission_pct NUMERIC DEFAULT 3.0,
  contract_signed_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Saved monitors / scheduled workflows
CREATE TABLE IF NOT EXISTS saved_monitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location_query TEXT,
  sources TEXT[] DEFAULT '{}',
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  cron_expr TEXT,
  schedule_label TEXT,
  delivery_channel TEXT DEFAULT 'dashboard',
  delivery_target TEXT,
  timezone TEXT NOT NULL DEFAULT 'Europe/Prague',
  enabled BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  last_digest_at TIMESTAMPTZ,
  last_run_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Generated artifacts from agent workflows
CREATE TABLE IF NOT EXISTS generated_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('report', 'slides', 'chart', 'email_draft', 'table', 'schedule')),
  title TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Price history (historie cen)
CREATE TABLE IF NOT EXISTS price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) NOT NULL,
  price NUMERIC NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Portal monitoring (monitoring portálů)
CREATE TABLE IF NOT EXISTS portal_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal TEXT NOT NULL CHECK (portal ~ '^[a-z0-9_:-]+$'),
  external_id TEXT,
  title TEXT NOT NULL,
  price NUMERIC,
  city TEXT,
  district TEXT,
  url TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_competitor BOOLEAN DEFAULT FALSE,
  notes TEXT
);

-- =============================================================================
-- FORWARD-COMPAT ALTERs
-- =============================================================================
ALTER TABLE properties ADD COLUMN IF NOT EXISTS renovation_status TEXT CHECK (renovation_status IN ('original', 'partial', 'complete', 'planned', 'unknown'));
ALTER TABLE properties ADD COLUMN IF NOT EXISTS last_reconstruction_year INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS building_modifications TEXT[] DEFAULT '{}';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS reconstruction_notes TEXT;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'unknown' CHECK (source IN ('web', 'referral', 'portal', 'social', 'direct', 'partner', 'returning', 'unknown'));
ALTER TABLE clients ADD COLUMN IF NOT EXISTS source_details TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE saved_monitors ADD COLUMN IF NOT EXISTS filters JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE saved_monitors ADD COLUMN IF NOT EXISTS delivery_target TEXT;
ALTER TABLE saved_monitors ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Europe/Prague';
ALTER TABLE saved_monitors ADD COLUMN IF NOT EXISTS last_digest_at TIMESTAMPTZ;
ALTER TABLE saved_monitors ADD COLUMN IF NOT EXISTS last_run_status TEXT;

ALTER TABLE portal_listings DROP CONSTRAINT IF EXISTS portal_listings_portal_check;
ALTER TABLE portal_listings ADD CONSTRAINT portal_listings_portal_check CHECK (portal ~ '^[a-z0-9_:-]+$');

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_properties_city ON properties(city);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_type ON properties(type);
CREATE INDEX IF NOT EXISTS idx_properties_price ON properties(price);
CREATE INDEX IF NOT EXISTS idx_clients_acquired_at ON clients(acquired_at);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_alerts_read ON alerts(read);
CREATE INDEX IF NOT EXISTS idx_calendar_start ON calendar_events(start_at);
CREATE INDEX IF NOT EXISTS idx_sales_closed_at ON sales(closed_at);
CREATE INDEX IF NOT EXISTS idx_operations_tasks_status ON operations_tasks(status);
CREATE INDEX IF NOT EXISTS idx_saved_monitors_enabled ON saved_monitors(enabled);
CREATE INDEX IF NOT EXISTS idx_portal_listings_portal ON portal_listings(portal);
CREATE INDEX IF NOT EXISTS idx_saved_monitors_last_run_at ON saved_monitors(last_run_at);
CREATE INDEX IF NOT EXISTS idx_portal_listings_last_seen_at ON portal_listings(last_seen_at);

-- =============================================================================
-- SEED DATA
-- =============================================================================

-- Agents
INSERT INTO agents (id, name, email, phone) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Vojtěch Studnička', 'vojta@realitymonitor.cz', '+420 777 123 456'),
  ('a1000000-0000-0000-0000-000000000002', 'Lucie Nováková', 'lucie@realitymonitor.cz', '+420 777 234 567');

-- Properties
INSERT INTO properties (id, title, type, status, price, price_per_m2, area_m2, rooms, floor, total_floors, city, district, address, lat, lon, description, energy_rating, has_parking, has_balcony, has_elevator, year_built, agent_id, listed_at) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'Byt 3+kk, Vinohrady', 'byt', 'aktivní', 8950000, 119333, 75, '3+kk', 3, 5, 'Praha', 'Vinohrady', 'Vinohradská 42, Praha 2', 50.0755, 14.4378, 'Prostorný byt v žádané lokalitě s balkonem a sklepem. Klidná ulice, blízko parku Riegrovy sady.', 'C', false, true, true, 1935, 'a1000000-0000-0000-0000-000000000001', '2026-03-20'),
  ('b1000000-0000-0000-0000-000000000002', 'Byt 2+1, Smíchov', 'byt', 'aktivní', 6200000, 103333, 60, '2+1', 2, 4, 'Praha', 'Smíchov', 'Nádražní 28, Praha 5', 50.0694, 14.4031, 'Světlý byt po kompletní rekonstrukci, 5 min od metra Anděl.', 'B', false, false, false, 1960, 'a1000000-0000-0000-0000-000000000001', '2026-03-19'),
  ('b1000000-0000-0000-0000-000000000003', 'Rodinný dům, Černošice', 'dům', 'rezervace', 12500000, 78125, 160, '5+1', NULL, 2, 'Černošice', 'Praha-západ', 'Karlštejnská 15, Černošice', 49.9614, 14.3192, 'Rodinný dům se zahradou 450m² a dvojgaráží. Klidná lokalita.', NULL, true, false, false, 2010, 'a1000000-0000-0000-0000-000000000002', '2026-03-18'),
  ('b1000000-0000-0000-0000-000000000004', 'Byt 1+kk, Karlín', 'byt', 'aktivní', 4800000, 133333, 36, '1+kk', 6, 8, 'Praha', 'Karlín', 'Křižíkova 88, Praha 8', 50.0922, 14.4507, 'Moderní byt v novostavbě s lodžií a sklepní kójí.', 'A', true, true, true, 2024, 'a1000000-0000-0000-0000-000000000001', '2026-03-21'),
  ('b1000000-0000-0000-0000-000000000005', 'Byt 4+kk, Dejvice', 'byt', 'aktivní', 15200000, 126667, 120, '4+kk', 4, 6, 'Praha', 'Dejvice', 'Evropská 15, Praha 6', 50.1001, 14.3900, 'Luxusní byt s terasou 25m² a výhledem na Hradčany.', 'B', true, true, true, 2018, 'a1000000-0000-0000-0000-000000000002', '2026-03-17'),
  ('b1000000-0000-0000-0000-000000000006', 'Komerční prostor, Centrum', 'komerční', 'aktivní', 22000000, 91667, 240, '-', 0, 3, 'Praha', 'Praha 1', 'Na Příkopě 12, Praha 1', 50.0833, 14.4167, NULL, 'D', false, false, true, 1890, 'a1000000-0000-0000-0000-000000000001', '2026-03-16'),
  ('b1000000-0000-0000-0000-000000000007', 'Byt 2+kk, Brno-střed', 'byt', 'aktivní', 4200000, 84000, 50, '2+kk', 3, 5, 'Brno', 'Brno-střed', 'Česká 22, Brno', 49.1951, 16.6068, 'Byt v centru Brna s parkováním v suterénu.', 'C', true, false, true, 2005, 'a1000000-0000-0000-0000-000000000002', '2026-03-21'),
  ('b1000000-0000-0000-0000-000000000008', 'Pozemek, Říčany', 'pozemek', 'aktivní', 3600000, 4500, 800, '-', NULL, NULL, 'Říčany', 'Praha-východ', 'Za Školou, Říčany', 49.9908, 14.6539, 'Stavební pozemek s IS na hranici pozemku. Rovinatý terén.', NULL, false, false, false, NULL, 'a1000000-0000-0000-0000-000000000001', '2026-03-15');

UPDATE properties SET
  renovation_status = 'partial',
  last_reconstruction_year = 2019,
  building_modifications = '{"nová kuchyně","podlahy"}',
  reconstruction_notes = 'Částečná rekonstrukce v roce 2019'
WHERE id = 'b1000000-0000-0000-0000-000000000001';

UPDATE properties SET
  renovation_status = 'complete',
  last_reconstruction_year = 2024,
  building_modifications = '{"nové rozvody","rekonstrukce koupelny"}',
  reconstruction_notes = 'Kompletní rekonstrukce 2024'
WHERE id = 'b1000000-0000-0000-0000-000000000002';

UPDATE properties SET
  renovation_status = 'unknown',
  last_reconstruction_year = NULL,
  building_modifications = '{}',
  reconstruction_notes = NULL
WHERE id IN (
  'b1000000-0000-0000-0000-000000000003',
  'b1000000-0000-0000-0000-000000000004',
  'b1000000-0000-0000-0000-000000000006',
  'b1000000-0000-0000-0000-000000000008'
);

-- Clients
INSERT INTO clients (id, name, email, phone, type, budget_min, budget_max, preferred_cities, preferred_districts, preferred_rooms, notes, agent_id) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'Jan Novák', 'jan.novak@email.cz', '+420 602 111 222', 'buyer', 7000000, 10000000, '{"Praha"}', '{"Vinohrady","Žižkov","Vršovice"}', '{"3+kk","3+1"}', 'Preferuje starší zástavbu, klidnou ulici. Má schválenou hypotéku.', 'a1000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000002', 'Marie Dvořáková', 'marie.dvorakova@email.cz', '+420 603 222 333', 'buyer', 4000000, 6000000, '{"Praha"}', '{"Karlín","Holešovice","Letná"}', '{"2+kk","2+1"}', 'Hledá první byt, single. Preferuje novostavbu nebo po rekonstrukci.', 'a1000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000003', 'Petr Svoboda', 'petr.svoboda@email.cz', '+420 604 333 444', 'buyer', 10000000, 15000000, '{"Černošice","Dobřichovice","Řevnice"}', '{"Praha-západ"}', '{"5+1","4+1"}', 'Rodina s dětmi, hledá RD se zahradou. Vlakové spojení do centra nutné.', 'a1000000-0000-0000-0000-000000000002'),
  ('d1000000-0000-0000-0000-000000000004', 'Tomáš Horák', 'tomas.horak@email.cz', '+420 605 444 555', 'investor', 3000000, 8000000, '{"Praha","Brno"}', '{"Smíchov","Nusle","Brno-střed"}', '{"1+kk","2+kk"}', 'Investiční nákup, hledá výnos min. 4% p.a. Hotovost.', 'a1000000-0000-0000-0000-000000000002'),
  ('d1000000-0000-0000-0000-000000000005', 'Eva Černá', 'eva.cerna@firma.cz', '+420 606 555 666', 'buyer', 15000000, 25000000, '{"Praha"}', '{"Praha 1","Praha 2"}', '{"-"}', 'Hledá komerční prostor pro kavárnu. Min. 150m².', 'a1000000-0000-0000-0000-000000000001');

UPDATE clients SET source = 'web', source_details = 'Web formulář', acquired_at = '2026-01-12 10:00:00+01', created_at = '2026-01-12 10:00:00+01'
WHERE id = 'd1000000-0000-0000-0000-000000000001';
UPDATE clients SET source = 'portal', source_details = 'Sreality lead', acquired_at = '2026-02-04 09:30:00+01', created_at = '2026-02-04 09:30:00+01'
WHERE id = 'd1000000-0000-0000-0000-000000000002';
UPDATE clients SET source = 'referral', source_details = 'Doporučení od předchozího klienta', acquired_at = '2026-03-02 13:00:00+01', created_at = '2026-03-02 13:00:00+01'
WHERE id = 'd1000000-0000-0000-0000-000000000003';
UPDATE clients SET source = 'partner', source_details = 'Hypoteční partner', acquired_at = '2026-03-15 08:15:00+01', created_at = '2026-03-15 08:15:00+01'
WHERE id = 'd1000000-0000-0000-0000-000000000004';
UPDATE clients SET source = 'direct', source_details = 'Přímý kontakt', acquired_at = '2025-12-09 11:00:00+01', created_at = '2025-12-09 11:00:00+01'
WHERE id = 'd1000000-0000-0000-0000-000000000005';

-- Leads
INSERT INTO leads (client_id, property_id, status, source, notes, next_action, next_action_date) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'viewing_scheduled', 'web', 'Klient viděl inzerát online, chce prohlídku.', 'Prohlídka', '2026-03-22 14:00:00+01'),
  ('d1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000004', 'contacted', 'phone', 'Volala s dotazem, poslán email s detaily.', 'Follow-up call', '2026-03-23 10:00:00+01'),
  ('d1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000003', 'offer_made', 'referral', 'Nabídka 12M, čekáme na odpověď vlastníka.', 'Čekání na vlastníka', '2026-03-24 12:00:00+01'),
  ('d1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000002', 'viewing_done', 'web', 'Prohlídka proběhla, klient zvažuje. Počítá ROI.', 'Zaslat výpočet ROI', '2026-03-23 15:00:00+01'),
  ('d1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000006', 'new', 'web', 'Nový lead přes web formulář.', 'První kontakt', '2026-03-22 16:00:00+01');

UPDATE leads SET created_at = '2026-03-18 09:15:00+01' WHERE client_id = 'd1000000-0000-0000-0000-000000000001' AND property_id = 'b1000000-0000-0000-0000-000000000001';
UPDATE leads SET created_at = '2026-03-20 15:45:00+01' WHERE client_id = 'd1000000-0000-0000-0000-000000000002' AND property_id = 'b1000000-0000-0000-0000-000000000004';
UPDATE leads SET created_at = '2026-02-08 09:30:00+01' WHERE client_id = 'd1000000-0000-0000-0000-000000000003' AND property_id = 'b1000000-0000-0000-0000-000000000003';
UPDATE leads SET created_at = '2025-12-13 14:00:00+01' WHERE client_id = 'd1000000-0000-0000-0000-000000000004' AND property_id = 'b1000000-0000-0000-0000-000000000002';
UPDATE leads SET created_at = '2025-10-10 09:00:00+01' WHERE client_id = 'd1000000-0000-0000-0000-000000000005' AND property_id = 'b1000000-0000-0000-0000-000000000006';

INSERT INTO leads (client_id, property_id, status, source, notes, next_action, next_action_date, created_at) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'contacted', 'web', 'Historický lead z webu.', 'Poslat podklady', '2025-11-06 10:00:00+01', '2025-11-05 11:00:00+01'),
  ('d1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000004', 'contacted', 'portal', 'Poptávka přes portál.', 'Telefonát', '2026-01-10 09:00:00+01', '2026-01-09 12:00:00+01'),
  ('d1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000002', 'negotiating', 'web', 'Aktivní vyjednávání.', 'Upřesnit podmínky', '2026-03-24 11:00:00+01', '2026-03-22 13:20:00+01');

-- Calendar events
INSERT INTO calendar_events (title, type, start_at, end_at, location, client_id, property_id, agent_id, notes) VALUES
  ('Prohlídka: Byt 3+kk Vinohrady', 'viewing', '2026-03-22 14:00:00+01', '2026-03-22 15:00:00+01', 'Vinohradská 42, Praha 2', 'd1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Klient má zájem o lokalitu, budget 9M.'),
  ('Schůzka: Nový klient Dvořáková', 'meeting', '2026-03-22 16:30:00+01', '2026-03-22 17:30:00+01', 'Kancelář', 'd1000000-0000-0000-0000-000000000002', NULL, 'a1000000-0000-0000-0000-000000000001', 'Hledá 2+kk v Karlíně nebo Holešovicích.'),
  ('Prohlídka: Dům Černošice', 'viewing', '2026-03-23 10:00:00+01', '2026-03-23 11:00:00+01', 'Karlštejnská 15, Černošice', 'd1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000002', NULL),
  ('Deadline: Nabídka Komerční banka', 'deadline', '2026-03-24 17:00:00+01', NULL, NULL, 'd1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001', 'Smlouva musí být hotova do tohoto data.'),
  ('Týdenní report', 'report', '2026-03-25 09:00:00+01', '2026-03-25 10:00:00+01', 'Kancelář', NULL, NULL, 'a1000000-0000-0000-0000-000000000001', 'Přehled prodejů a nových nabídek.'),
  ('Prohlídka: Byt 2+kk Smíchov', 'viewing', '2026-03-25 11:00:00+01', '2026-03-25 12:00:00+01', 'Nádražní 28, Praha 5', 'd1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', NULL);

-- Alerts
INSERT INTO alerts (type, title, description, severity, property_id, read) VALUES
  ('price_drop', 'Snížení ceny: Byt 3+kk Vinohrady', 'Cena snížena o 500 000 Kč (z 9 450 000 na 8 950 000 Kč)', 'high', 'b1000000-0000-0000-0000-000000000001', false),
  ('new_listing', 'Nová nabídka: Byt 2+kk Karlín', 'Nový byt v preferované lokalitě. 52m², 5 200 000 Kč.', 'medium', 'b1000000-0000-0000-0000-000000000004', false),
  ('status_change', 'Změna stavu: Dům Černošice', 'Nemovitost přešla do stavu "rezervace". Klient: Svoboda.', 'medium', 'b1000000-0000-0000-0000-000000000003', true),
  ('market_shift', 'Tržní signál: Praha 5', 'Průměrná cena/m² v Praze 5 vzrostla o 3.2% za poslední měsíc.', 'low', NULL, true),
  ('portal_update', 'Sreality: Nové nabídky konkurence', '12 nových nabídek v monitorovaných lokalitách za posledních 24h.', 'low', NULL, true),
  ('price_drop', 'Snížení ceny: Komerční prostor P1', 'Cena snížena o 2M Kč. Nyní 20 000 000 Kč.', 'high', 'b1000000-0000-0000-0000-000000000006', true);

-- Price history
INSERT INTO price_history (property_id, price, recorded_at) VALUES
  ('b1000000-0000-0000-0000-000000000001', 9450000, '2026-03-01'),
  ('b1000000-0000-0000-0000-000000000001', 9200000, '2026-03-10'),
  ('b1000000-0000-0000-0000-000000000001', 8950000, '2026-03-20'),
  ('b1000000-0000-0000-0000-000000000006', 24000000, '2026-03-01'),
  ('b1000000-0000-0000-0000-000000000006', 22000000, '2026-03-16');

-- Sales (historical)
INSERT INTO sales (property_id, client_id, agent_id, sale_price, commission, commission_pct, contract_signed_at, closed_at) VALUES
  ('b1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000002', 12000000, 360000, 3.0, '2026-02-10', '2026-02-14');

INSERT INTO sales (property_id, client_id, agent_id, sale_price, commission, commission_pct, contract_signed_at, closed_at, notes) VALUES
  ('b1000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 19800000, 594000, 3.0, '2025-10-15', '2025-10-21', 'Historický komerční prodej'),
  ('b1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000002', 6100000, 183000, 3.0, '2025-12-12', '2025-12-18', 'Investiční byt'),
  ('b1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 8800000, 264000, 3.0, '2026-01-20', '2026-01-26', 'Rezidenční prodej'),
  ('b1000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 4700000, 141000, 3.0, '2026-03-19', '2026-03-21', 'Malometrážní byt');
