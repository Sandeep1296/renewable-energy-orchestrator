/**
 * Live telemetry adapter: real wind/cloud/temperature from Open-Meteo
 * (free, no key) blended into the dispatch cycle. Falls back to simulated
 * telemetry on any failure — the cycle never depends on the network.
 * Demo coordinates are approximate site locations.
 */

export interface LiveReading {
  windMs: number;
  cloudPct: number;
  tempC: number;
}

const FARM_COORDS: Record<string, { lat: number; lon: number }> = {
  'SOL-01': { lat: 33.5, lon: -112.1 },
  'SOL-02': { lat: 35.0, lon: -114.6 },
  'SOL-03': { lat: 36.7, lon: -119.7 },
  'SOL-04': { lat: 35.2, lon: -111.7 },
  'SOL-05': { lat: 39.7, lon: -104.9 },
  'WND-01': { lat: 46.0, lon: -120.0 },
  'WND-02': { lat: 45.7, lon: -121.5 },
  'WND-03': { lat: 46.2, lon: -124.0 },
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { at: number; readings: Record<string, LiveReading> } | null = null;
// Operator override (via PUT /api/weather/mode): 'live' | 'simulated' | null (auto)
let modeOverride: 'live' | 'simulated' | null = null;

export function setWeatherMode(mode: 'live' | 'simulated' | 'auto'): 'live' | 'simulated' | 'auto' {
  modeOverride = mode === 'auto' ? null : mode;
  cache = null; // force fresh read on next cycle
  return mode;
}

export function getWeatherMode(): { configured: 'live' | 'simulated' | 'auto'; effective: 'live' | 'simulated' } {
  if (modeOverride) return { configured: modeOverride, effective: modeOverride };
  const envLive = (process.env.LIVE_WEATHER || 'true').toLowerCase() !== 'false';
  return { configured: 'auto', effective: envLive ? 'live' : 'simulated' };
}

export function liveWeatherEnabled(): boolean {
  if (modeOverride) return modeOverride === 'live';
  return (process.env.LIVE_WEATHER || 'true').toLowerCase() !== 'false';
}

export async function fetchLiveWeather(farmIds: string[]): Promise<{
  readings: Record<string, LiveReading>;
  source: 'live' | 'simulated';
  note: string;
}> {
  const ids = farmIds.filter((id) => FARM_COORDS[id]);
  if (!liveWeatherEnabled() || ids.length === 0) {
    return { readings: {}, source: 'simulated', note: 'Live weather disabled or no mapped farms — simulated telemetry.' };
  }
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { readings: cache.readings, source: 'live', note: `Open-Meteo cache hit (${Math.round((Date.now() - cache.at) / 1000)}s old).` };
  }
  try {
    const lat = ids.map((id) => FARM_COORDS[id].lat).join(',');
    const lon = ids.map((id) => FARM_COORDS[id].lon).join(',');
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,cloud_cover,wind_speed_10m&wind_speed_unit=ms&timezone=auto`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const data: any = await res.json();
    const arr = Array.isArray(data) ? data : [data];
    const readings: Record<string, LiveReading> = {};
    arr.forEach((loc: any, i: number) => {
      const c = loc?.current || {};
      readings[ids[i]] = {
        windMs: Math.round(Number(c.wind_speed_10m ?? 0) * 10) / 10,
        cloudPct: Math.round(Number(c.cloud_cover ?? 0)),
        tempC: Math.round((Number(c.temperature_2m ?? 20)) * 10) / 10,
      };
    });
    cache = { at: Date.now(), readings };
    return { readings, source: 'live', note: `Open-Meteo live readings for ${ids.length} sites.` };
  } catch (e: any) {
    console.warn('[weather] live fetch failed, simulated fallback:', String(e?.message || e).slice(0, 140));
    return { readings: {}, source: 'simulated', note: 'Live fetch failed — simulated telemetry.' };
  }
}

/** Blend live readings into the portfolio. Active shock states are preserved. */
export function applyLiveWeather(portfolio: any, readings: Record<string, LiveReading>): string[] {
  const notes: string[] = [];
  const shocked = portfolio.weather?.stormAlert || portfolio.weather?.condition === 'heavy_overcast';
  for (const farm of [...(portfolio.windFarms || [])]) {
    const r = readings[farm.id];
    if (!r) continue;
    if (farm.gustWarning || (farm.windSpeedMs || 0) > 22) {
      notes.push(`${farm.id}: shock state preserved (${farm.windSpeedMs} m/s)`);
      continue;
    }
    farm.windSpeedMs = r.windMs;
    const ratio = Math.min(1, Math.max(0.1, (r.windMs - 3.5) / 8.0));
    farm.currentOutputMw = Math.round(farm.capacityMw * ratio * 10) / 10;
    notes.push(`${farm.id}: live ${r.windMs} m/s → ${farm.currentOutputMw} MW`);
  }
  for (const farm of [...(portfolio.solarFarms || [])]) {
    const r = readings[farm.id];
    if (!r) continue;
    if (shocked || farm.status !== 'online') {
      notes.push(`${farm.id}: shock/offline state preserved`);
      continue;
    }
    const factor = 1 - (0.85 * r.cloudPct) / 100;
    farm.currentOutputMw = Math.round(farm.capacityMw * Math.max(0.05, factor) * 10) / 10;
    farm.forecast15minMw = farm.currentOutputMw;
    notes.push(`${farm.id}: live cloud ${r.cloudPct}% → ${farm.currentOutputMw} MW`);
  }
  const all = Object.values(readings);
  if (all.length && portfolio.weather && !shocked) {
    portfolio.weather.cloudCoverPct = Math.round(all.reduce((s, r) => s + r.cloudPct, 0) / all.length);
    portfolio.weather.temperatureC = Math.round((all.reduce((s, r) => s + r.tempC, 0) / all.length) * 10) / 10;
  }
  return notes;
}
