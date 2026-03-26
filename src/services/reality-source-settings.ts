export type RealityPropertySource =
  | 'all'
  | 'sreality'
  | 'reality_idnes'
  | 'flatzone'
  | 'bezrealitky'
  | 'internal';

const STORAGE_KEY = 'wm-reality-property-source';
const EVENT_NAME = 'wm-reality-property-source-changed';

export const REALITY_PROPERTY_SOURCE_OPTIONS: Array<{ value: RealityPropertySource; label: string }> = [
  { value: 'all', label: 'Všechny zdroje' },
  { value: 'sreality', label: 'Sreality' },
  { value: 'reality_idnes', label: 'Reality.iDNES' },
  { value: 'flatzone', label: 'Flat Zone' },
  { value: 'bezrealitky', label: 'Bezrealitky' },
  { value: 'internal', label: 'Interní data' },
];

const ALLOWED_VALUES = new Set(REALITY_PROPERTY_SOURCE_OPTIONS.map((option) => option.value));

export function getRealityPropertySource(): RealityPropertySource {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && ALLOWED_VALUES.has(raw as RealityPropertySource)) {
      return raw as RealityPropertySource;
    }
  } catch {
    // ignore
  }

  return 'all';
}

export function setRealityPropertySource(source: RealityPropertySource): void {
  const safe = ALLOWED_VALUES.has(source) ? source : 'all';

  try {
    localStorage.setItem(STORAGE_KEY, safe);
  } catch {
    // ignore
  }

  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { source: safe } }));
}

export function subscribeRealityPropertySourceChange(
  cb: (source: RealityPropertySource) => void,
): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent).detail as { source?: RealityPropertySource } | undefined;
    cb(detail?.source && ALLOWED_VALUES.has(detail.source) ? detail.source : getRealityPropertySource());
  };

  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
