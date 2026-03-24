import { getCorsHeaders } from './_cors.js';
import { isConfigured, queryTable } from './_supabase.js';

export const config = { runtime: 'edge' };

const CHECKED_FIELDS = [
  { field: 'price', label: 'Cena', severity: 'critical' },
  { field: 'area_m2', label: 'Plocha', severity: 'critical' },
  { field: 'description', label: 'Popis nemovitosti', severity: 'warning' },
  { field: 'energy_rating', label: 'Energetický štítek', severity: 'critical' },
  { field: 'photos', label: 'Fotografie', severity: 'warning' },
  { field: 'floor_plan_url', label: 'Půdorys', severity: 'info' },
  { field: 'virtual_tour_url', label: 'Virtuální prohlídka', severity: 'info' },
];

export default async function handler(req) {
  const cors = getCorsHeaders(req, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  if (!isConfigured()) {
    return new Response(JSON.stringify({ missing: [], total: 0, source: 'demo' }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Fetch active properties with all relevant fields (limit to 50 for performance)
    const properties = await queryTable('properties',
      `select=id,title,price,area_m2,description,energy_rating,photos,floor_plan_url,virtual_tour_url&status=eq.aktivn${encodeURIComponent('í')}&order=listed_at.desc&limit=50`
    );

    const missing = [];
    for (const prop of properties) {
      for (const check of CHECKED_FIELDS) {
        const val = prop[check.field];
        const isEmpty = val === null || val === undefined || val === '' ||
          (Array.isArray(val) && val.length === 0);
        if (isEmpty) {
          missing.push({
            propertyId: prop.id,
            propertyTitle: prop.title || `Nemovitost #${prop.id}`,
            field: check.field,
            fieldLabel: check.label,
            severity: check.severity,
          });
        }
      }
    }

    // Sort: critical first, then warning, then info
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    missing.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

    return new Response(JSON.stringify({
      missing,
      total: missing.length,
      propertiesScanned: properties.length,
      source: 'supabase',
    }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
}
