import type { MapView } from '@/components';

const STORAGE_KEY = 'wm-focus-view';
const EVENT_NAME = 'wm-focus-view-changed';
const VALID_VIEWS: MapView[] = ['global', 'america', 'mena', 'eu', 'asia', 'latam', 'africa', 'oceania', 'czechia'];

function isMapView(value: string | null): value is MapView {
  return value !== null && VALID_VIEWS.includes(value as MapView);
}

function readInitialView(): MapView {
  if (typeof window === 'undefined') return 'global';

  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get('view');
    if (isMapView(fromUrl)) return fromUrl;
  } catch {
    // Ignore malformed location values.
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isMapView(stored)) return stored;
  } catch {
    // Ignore storage access failures.
  }

  return 'global';
}

let currentView: MapView = readInitialView();

export function getFocusView(): MapView {
  return currentView;
}

export function setFocusView(view: MapView): void {
  if (view === currentView) return;
  currentView = view;

  try {
    window.localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // Ignore storage access failures.
  }

  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { view } }));
}

export function subscribeFocusView(cb: (view: MapView) => void): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent).detail as { view?: MapView } | undefined;
    cb(detail?.view ?? currentView);
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
