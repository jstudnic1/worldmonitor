export const SITE_VARIANT: string = (() => {
  // Build-time env var (baked by Vite) — highest priority for non-full variants
  const buildVariant = import.meta.env.VITE_VARIANT;

  if (typeof window === 'undefined') return buildVariant || 'full';

  const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
  if (isTauri) {
    const stored = localStorage.getItem('worldmonitor-variant');
    if (stored === 'tech' || stored === 'full' || stored === 'finance' || stored === 'happy' || stored === 'commodity' || stored === 'reality') return stored;
    return buildVariant || 'full';
  }

  // Subdomain detection
  const h = location.hostname;
  if (h.startsWith('tech.')) return 'tech';
  if (h.startsWith('finance.')) return 'finance';
  if (h.startsWith('happy.')) return 'happy';
  if (h.startsWith('commodity.')) return 'commodity';
  if (h.startsWith('reality.')) return 'reality';

  // If build was configured with a specific variant, use it (covers Vercel deploys)
  if (buildVariant && buildVariant !== 'full') return buildVariant;

  // Localhost: check localStorage override
  if (h === 'localhost' || h === '127.0.0.1') {
    const stored = localStorage.getItem('worldmonitor-variant');
    if (stored === 'tech' || stored === 'full' || stored === 'finance' || stored === 'happy' || stored === 'commodity' || stored === 'reality') return stored;
  }

  return buildVariant || 'full';
})();
