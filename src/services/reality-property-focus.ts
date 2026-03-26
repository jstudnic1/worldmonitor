export interface RealityPropertyFocus {
  id: string;
  lat?: number | null;
  lon?: number | null;
  title?: string;
}

const EVENT_NAME = 'wm-reality-property-focus';

let currentFocus: RealityPropertyFocus | null = null;

function normalizeCoordinate(value: number | null | undefined): number | null {
  return Number.isFinite(value) ? Number(value) : null;
}

function normalizeFocus(focus: RealityPropertyFocus | null): RealityPropertyFocus | null {
  if (!focus?.id) return null;
  return {
    id: focus.id,
    title: focus.title || '',
    lat: normalizeCoordinate(focus.lat),
    lon: normalizeCoordinate(focus.lon),
  };
}

export function getFocusedRealityProperty(): RealityPropertyFocus | null {
  return currentFocus;
}

export function setFocusedRealityProperty(focus: RealityPropertyFocus | null): void {
  currentFocus = normalizeFocus(focus);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { focus: currentFocus } }));
}

export function subscribeRealityPropertyFocusChange(
  cb: (focus: RealityPropertyFocus | null) => void,
): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent).detail as { focus?: RealityPropertyFocus | null } | undefined;
    cb(normalizeFocus(detail?.focus ?? null));
  };

  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
