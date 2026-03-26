// Reality variant - Czech Real Estate Intelligence Dashboard
import type { PanelConfig, MapLayers } from '@/types';
import type { VariantConfig } from './base';

// Re-export base config
export * from './base';

// Re-export feeds infrastructure
export {
  SOURCE_TIERS,
  getSourceTier,
  SOURCE_TYPES,
  getSourceType,
  getSourcePropagandaRisk,
  type SourceRiskProfile,
  type SourceType,
} from '../feeds';

// Reality-specific RSS feeds for Czech real estate
import type { Feed } from '@/types';
import { rssProxyUrl } from '@/utils';

const rss = rssProxyUrl;

export const FEEDS: Record<string, Feed[]> = {
  'reality-news': [
    { name: 'Sreality', url: rss('https://news.google.com/rss/search?q=site:sreality.cz+OR+"sreality"+when:7d&hl=cs&gl=CZ&ceid=CZ:cs'), lang: 'cs' },
    { name: 'Bezrealitky', url: rss('https://news.google.com/rss/search?q=site:bezrealitky.cz+OR+"bezrealitky"+when:7d&hl=cs&gl=CZ&ceid=CZ:cs'), lang: 'cs' },
    { name: 'Reality iDNES', url: rss('https://news.google.com/rss/search?q=site:reality.idnes.cz+when:7d&hl=cs&gl=CZ&ceid=CZ:cs'), lang: 'cs' },
    { name: 'Flat Zone', url: rss('https://news.google.com/rss/search?q=site:flatzone.cz+OR+"Flat+Zone"+OR+"novostavby"+when:7d&hl=cs&gl=CZ&ceid=CZ:cs'), lang: 'cs' },
    { name: 'Realitni zpravy', url: rss('https://news.google.com/rss/search?q="realitní+trh"+OR+"nemovitosti"+OR+"byty"+when:3d&hl=cs&gl=CZ&ceid=CZ:cs'), lang: 'cs' },
  ],
  'market-analysis': [
    { name: 'CNB Hypoteky', url: rss('https://news.google.com/rss/search?q=("hypotéka"+OR+"úroková+sazba"+OR+"ČNB")+nemovitost+when:7d&hl=cs&gl=CZ&ceid=CZ:cs'), lang: 'cs' },
    { name: 'Ceny bytu', url: rss('https://news.google.com/rss/search?q=("ceny+bytů"+OR+"ceny+nemovitostí"+OR+"realitní+trh")+when:3d&hl=cs&gl=CZ&ceid=CZ:cs'), lang: 'cs' },
    { name: 'Development', url: rss('https://news.google.com/rss/search?q=("developerský+projekt"+OR+"nová+výstavba"+OR+"development")+Praha+OR+Brno+when:7d&hl=cs&gl=CZ&ceid=CZ:cs'), lang: 'cs' },
  ],
  'legal-regulation': [
    { name: 'Stavební zákon', url: rss('https://news.google.com/rss/search?q=("stavební+zákon"+OR+"stavební+povolení"+OR+"územní+plán")+when:14d&hl=cs&gl=CZ&ceid=CZ:cs'), lang: 'cs' },
    { name: 'Katastry', url: rss('https://news.google.com/rss/search?q=("katastr+nemovitostí"+OR+"ČÚZK"+OR+"zápis+do+katastru")+when:14d&hl=cs&gl=CZ&ceid=CZ:cs'), lang: 'cs' },
  ],
  'czech-economy': [
    { name: 'HN Reality', url: rss('https://news.google.com/rss/search?q=site:hn.cz+reality+OR+nemovitosti+when:7d&hl=cs&gl=CZ&ceid=CZ:cs'), lang: 'cs' },
    { name: 'E15 Reality', url: rss('https://news.google.com/rss/search?q=site:e15.cz+reality+OR+byty+when:7d&hl=cs&gl=CZ&ceid=CZ:cs'), lang: 'cs' },
    { name: 'Czech Economy', url: rss('https://news.google.com/rss/search?q=("česká+ekonomika"+OR+"HDP"+OR+"inflace"+OR+"ČNB")+when:3d&hl=cs&gl=CZ&ceid=CZ:cs'), lang: 'cs' },
  ],
};

export const INTEL_SOURCES: Feed[] = [];

// Panel configuration for Czech real estate
export const DEFAULT_PANELS: Record<string, PanelConfig> = {
  map: { name: 'Mapa nemovitostí', enabled: true, priority: 1 },
  'ai-chat': { name: 'AI Asistent', enabled: true, priority: 1 },
  'property-feed': { name: 'Nabídky nemovitostí', enabled: true, priority: 1 },
  'market-stats': { name: 'Tržní statistiky', enabled: true, priority: 1 },
  'reality-news': { name: 'Realitní zprávy', enabled: true, priority: 1 },
  'market-analysis': { name: 'Analýza trhu', enabled: true, priority: 1 },
  'alerts-panel': { name: 'Upozornění', enabled: true, priority: 1 },
  'calendar-panel': { name: 'Kalendář', enabled: true, priority: 1 },
  'legal-regulation': { name: 'Legislativa', enabled: true, priority: 2 },
  'czech-economy': { name: 'Česká ekonomika', enabled: true, priority: 2 },
  'missing-data': { name: 'Chybějící data', enabled: true, priority: 2 },
  monitors: { name: 'Moje monitory', enabled: true, priority: 2 },
};

// Map layers for Czech real estate — minimal, focused on Czechia
export const DEFAULT_MAP_LAYERS: MapLayers = {
  gpsJamming: false,
  satellites: false,
  conflicts: false,
  bases: false,
  cables: false,
  pipelines: false,
  hotspots: false,
  ais: false,
  nuclear: false,
  irradiators: false,
  sanctions: false,
  weather: true,
  economic: true,
  waterways: false,
  outages: false,
  cyberThreats: false,
  datacenters: false,
  protests: false,
  flights: false,
  military: false,
  natural: false,
  spaceports: false,
  minerals: false,
  fires: false,
  ucdpEvents: false,
  displacement: false,
  climate: false,
  startupHubs: false,
  cloudRegions: false,
  accelerators: false,
  techHQs: false,
  techEvents: false,
  stockExchanges: false,
  financialCenters: false,
  centralBanks: false,
  commodityHubs: false,
  gulfInvestments: false,
  positiveEvents: false,
  kindness: false,
  happiness: false,
  speciesRecovery: false,
  renewableInstallations: false,
  tradeRoutes: false,
  iranAttacks: false,
  ciiChoropleth: false,
  dayNight: false,
  miningSites: false,
  processingPlants: false,
  commodityPorts: false,
  realityProperties: true,
};

export const MOBILE_DEFAULT_MAP_LAYERS: MapLayers = { ...DEFAULT_MAP_LAYERS };

export const VARIANT_CONFIG: VariantConfig = {
  name: 'reality',
  description: 'Czech Real Estate Intelligence Dashboard',
  panels: DEFAULT_PANELS,
  mapLayers: DEFAULT_MAP_LAYERS,
  mobileMapLayers: MOBILE_DEFAULT_MAP_LAYERS,
};
