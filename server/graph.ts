/**
 * Topology graph core: all sources feed a virtual collector bus; interties
 * export outward; consumers draw from the bus. Pure functions (no deps) so
 * impact analysis runs identically for the API, the Grid agent, and tests.
 * Optional Neo4j Aura persistence when NEO4J_URI is set (best-effort sync).
 */

export interface ImpactResult {
  scenario: string;
  removedExportMw: number;
  forcedCurtailMw: number;
  deficitMw: number;
  batteryCoverMw: number;
  affectedConsumers: Array<{ id: string; name: string; atRiskMw: number }>;
  note: string;
}

interface Sums {
  cleanGen: number;
  demand: number;
  battAvailMw: number;
  exportCapMw: number;
  flexibleMw: number;
}

function sumsOf(p: any): Sums {
  const cleanGen = [...(p.solarFarms || []), ...(p.windFarms || [])]
    .reduce((s: number, a: any) => s + (a.status === 'online' ? a.currentOutputMw || 0 : 0), 0);
  const demand = p.grid?.totalDemandMw ?? 0;
  const battAvailMw = (p.batteries || [])
    .filter((b: any) => b.status !== 'fault' && b.status !== 'maintenance' && b.currentSocPct > b.minSocPct)
    .reduce((s: number, b: any) => s + Math.min(b.powerRatingMw || 0, ((b.currentSocPct - b.minSocPct) / 100) * (b.capacityMwh || 0) * 4), 0);
  const exportCapMw = (p.interties || []).reduce((s: number, i: any) => s + (i.limitMw || 0), 0);
  const flexibleMw = (p.consumers || []).reduce((s: number, c: any) => s + (c.status === 'offline' ? 0 : c.flexibleDemandMw || 0), 0);
  return { cleanGen, demand, battAvailMw, exportCapMw, flexibleMw };
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** What breaks if an asset (or intertie) is removed? No portfolio mutation. */
export function analyzeImpact(portfolio: any, opts: { offlineAssetId?: string; removeIntertieId?: string }): ImpactResult {
  const id = opts.offlineAssetId || opts.removeIntertieId || '';
  const label = opts.removeIntertieId ? `intertie ${id} trips` : `asset ${id} offline`;
  const p = JSON.parse(JSON.stringify(portfolio));

  if (opts.removeIntertieId) {
    p.interties = (p.interties || []).filter((i: any) => i.id !== opts.removeIntertieId);
  } else if (id) {
    let found = false;
    for (const key of ['solarFarms', 'windFarms'] as const) {
      const arr = (p[key] || []).map((a: any) => (a.id === id ? { ...a, status: 'offline', currentOutputMw: 0 } : a));
      if (arr.some((a: any, i: number) => a.id === id && p[key][i]?.id === id)) found = true;
      p[key] = arr;
    }
    p.batteries = (p.batteries || []).map((b: any) => (b.id === id ? { ...b, status: 'fault', currentSocPct: b.minSocPct } : b));
    p.consumers = (p.consumers || []).filter((c: any) => c.id !== id);
    if (!found && !(p.batteries || []).some((b: any) => b.id === id) && (p.consumers || []).length === (portfolio.consumers || []).length) {
      return {
        scenario: label, removedExportMw: 0, forcedCurtailMw: 0, deficitMw: 0, batteryCoverMw: 0,
        affectedConsumers: [], note: `Unknown asset id ${id} — no topology change applied.`,
      };
    }
  }

  const s = sumsOf(p);
  const surplus = s.cleanGen - s.demand;
  const forcedCurtailMw = r1(Math.max(0, surplus - s.exportCapMw));
  const removedExport = opts.removeIntertieId
    ? r1((portfolio.interties || []).find((i: any) => i.id === opts.removeIntertieId)?.limitMw || 0)
    : 0;
  const rawDeficit = Math.max(0, s.demand - s.cleanGen);
  const batteryCoverMw = r1(Math.min(rawDeficit, s.battAvailMw));
  const deficitMw = r1(Math.max(0, rawDeficit - s.battAvailMw));

  const affectedConsumers = deficitMw > 0
    ? (p.consumers || [])
      .filter((c: any) => c.status !== 'offline' && (c.flexibleDemandMw || 0) > 0)
      .map((c: any) => ({
        id: c.id,
        name: c.name || c.id,
        atRiskMw: r1(Math.min(c.flexibleDemandMw || 0, (deficitMw * (c.flexibleDemandMw || 0)) / Math.max(1, s.flexibleMw))),
      }))
      .filter((c: any) => c.atRiskMw > 0)
    : [];

  const parts: string[] = [];
  if (removedExport > 0) parts.push(`${removedExport} MW export path lost`);
  if (forcedCurtailMw > 0) parts.push(`${forcedCurtailMw} MW must curtail`);
  if (batteryCoverMw > 0) parts.push(`batteries cover ${batteryCoverMw} MW`);
  if (deficitMw > 0) parts.push(`${deficitMw} MW unserved after storage`);
  if (parts.length === 0) parts.push('no energy-balance impact — reserves absorb it');
  return {
    scenario: label,
    removedExportMw: removedExport,
    forcedCurtailMw,
    deficitMw,
    batteryCoverMw,
    affectedConsumers,
    note: parts.join('; ') + '.',
  };
}

/** Best-effort Neo4j Aura sync (topology mirror). No-op unless configured. */
export type MirrorMode = 'auto' | 'off';

export function mirrorMode(): MirrorMode {
  return (process.env.GRAPH_MIRROR || 'auto').toLowerCase() === 'off' ? 'off' : 'auto';
}

let lastSync: { at: string; result: string } | null = null;
let lastSeededHash: string | null = null;

export function lastSyncInfo() {
  return lastSync;
}

export function getLastSeededHash(): string | null {
  return lastSeededHash;
}

export function topologyHash(portfolio: any): string {
  const s = JSON.stringify({
    sol: (portfolio.solarFarms || []).map((a: any) => [a.id, a.capacityMw, a.status]),
    wnd: (portfolio.windFarms || []).map((a: any) => [a.id, a.capacityMw, a.status]),
    bat: (portfolio.batteries || []).map((b: any) => [b.id, b.capacityMwh, b.powerRatingMw, b.status]),
    con: (portfolio.consumers || []).map((c: any) => [c.id, c.status]),
    ln: (portfolio.interties || []).map((i: any) => [i.id, i.limitMw]),
  });
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function driver() {
  const uri = process.env.NEO4J_URI;
  if (!uri) return null;
  return { uri, user: process.env.NEO4J_USER || 'neo4j', pass: process.env.NEO4J_PASSWORD || '' };
}

export async function syncToNeo4j(portfolio: any): Promise<string> {
  if (mirrorMode() === 'off') return 'disabled (GRAPH_MIRROR=off)';
  const r = await seedNeo4j(portfolio);
  const msg = r.ok && r.counts ? `synced topology to Neo4j (${r.counts.nodes} nodes)` : `skipped (${r.error || 'unknown'})`;
  lastSync = { at: new Date().toISOString(), result: msg };
  if (r.ok) lastSeededHash = topologyHash(portfolio);
  return msg;
}

/** Full topology seed (idempotent MERGEs — safe to re-run anytime). */
export async function seedNeo4j(portfolio: any): Promise<{
  ok: boolean;
  counts?: { nodes: number; rels: number; byLabel: Record<string, number> };
  error?: string;
}> {
  const cfg = driver();
  if (!cfg) return { ok: false, error: 'no NEO4J_URI' };
  try {
    const { default: neo4j } = await import('neo4j-driver' as any);
    const drv = neo4j.driver(cfg.uri, neo4j.auth.basic(cfg.user, cfg.pass));
    const session = drv.session();
    try {
      await session.run(`
        MERGE (b:Bus {id:'COLLECTOR'})
        SET b.cleanMw = $clean, b.demandMw = $dem, b.updatedAt = datetime()
        WITH b
        UNWIND $assets AS a
          MERGE (x:Asset {id:a.id})
          SET x.name=a.name, x.kind=a.kind, x.mw=a.mw, x.status=a.status, x.capacityMw=a.cap, x.windSpeedMs=a.ws, x.gustWarning=a.gust, x.capacityMwh=a.capmwh, x.powerRatingMw=a.pr, x.currentSocPct=a.soc, x.minSocPct=a.min, x.maxSocPct=a.max
          MERGE (x)-[:FEEDS_INTO]->(b)
        WITH b
        UNWIND $lines AS l
          MERGE (i:Intertie {id:l.id})
          SET i.name=l.name, i.limitMw=l.limit, i.flowMw=l.flow, i.congested=l.congested
          MERGE (b)-[:CONNECTS_VIA]->(i)
        WITH b
        UNWIND $loads AS c
          MERGE (u:Consumer {id:c.id})
          SET u.name=c.name, u.flexibleMw=c.flex, u.status=c.status, u.baseloadMw=c.base, u.totalMw=c.total
          MERGE (u)-[:DRAWS_FROM]->(b)`,
        {
          clean: sumsOf(portfolio).cleanGen,
          dem: sumsOf(portfolio).demand,
          assets: [
            ...(portfolio.solarFarms || []).map((a: any) => ({ id: a.id, name: a.name, kind: 'solar', mw: a.currentOutputMw || 0, status: a.status, cap: a.capacityMw || 0 })),
            ...(portfolio.windFarms || []).map((a: any) => ({ id: a.id, name: a.name, kind: 'wind', mw: a.currentOutputMw || 0, status: a.status, cap: a.capacityMw || 0, ws: a.windSpeedMs || 0, gust: !!a.gustWarning })),
            ...(portfolio.batteries || []).map((a: any) => ({ id: a.id, name: a.name, kind: 'bess', mw: a.targetPowerMw || 0, status: a.status, capmwh: a.capacityMwh || 0, pr: a.powerRatingMw || 0, soc: a.currentSocPct ?? 0, min: a.minSocPct ?? 0, max: a.maxSocPct ?? 100 })),
          ],
          lines: (portfolio.interties || []).map((l: any) => ({ id: l.id, name: l.name, limit: l.limitMw || 0, flow: l.currentFlowMw || 0, congested: !!l.congested })),
          loads: (portfolio.consumers || []).map((c: any) => ({ id: c.id, name: c.name, flex: c.flexibleDemandMw || 0, status: c.status, base: c.baseloadDemandMw || 0, total: c.totalDemandMw || 0 })),
        },
      );
      const counts = await session.run(
        `MATCH (n) WITH labels(n)[0] AS l, count(*) AS c RETURN l, c
         UNION ALL MATCH ()-[r]->() RETURN 'RELS' AS l, count(r) AS c`);
      const byLabel: Record<string, number> = {};
      let nodes = 0;
      let rels = 0;
      counts.records.forEach((rec: any) => {
        const l = rec.get('l');
        const c = Number(rec.get('c'));
        if (l === 'RELS') rels = c;
        else { byLabel[l] = c; nodes += c; }
      });
      lastSeededHash = topologyHash(portfolio);
      return { ok: true, counts: { nodes, rels, byLabel } };
    } finally {
      await session.close();
      await drv.close();
    }
  } catch (e: any) {
    const msg = String(e?.message || e).slice(0, 160);
    console.warn('[graph] Neo4j seed failed:', msg);
    return { ok: false, error: msg };
  }
}

/** Read the mirrored topology back as a portfolio-like snapshot. */
export async function readTopologySnapshot(): Promise<any | null> {
  const cfg = driver();
  if (!cfg || mirrorMode() === 'off') return null;
  try {
    const { default: neo4j } = await import('neo4j-driver' as any);
    const drv = neo4j.driver(cfg.uri, neo4j.auth.basic(cfg.user, cfg.pass), { connectionTimeout: 5000 });
    const session = drv.session();
    try {
      const assets = await session.run('MATCH (a:Asset) RETURN a.id AS id, a.name AS name, a.kind AS kind, a.mw AS mw, a.status AS status, a.capacityMw AS cap, a.windSpeedMs AS ws, a.gustWarning AS gust, a.capacityMwh AS capmwh, a.powerRatingMw AS pr, a.currentSocPct AS soc, a.minSocPct AS min, a.maxSocPct AS max', {}, { timeout: 8000 });
      const lines = await session.run('MATCH (i:Intertie) RETURN i.id AS id, i.name AS name, i.limitMw AS limit, i.flowMw AS flow, i.congested AS congested', {}, { timeout: 8000 });
      const loads = await session.run('MATCH (u:Consumer) RETURN u.id AS id, u.name AS name, u.flexibleMw AS flex, u.status AS status, u.baseloadMw AS base, u.totalMw AS total', {}, { timeout: 8000 });
      const bus = await session.run('MATCH (b:Bus {id:\'COLLECTOR\'}) RETURN b.demandMw AS dem', {}, { timeout: 8000 });
      const num = (rec: any, k: string, dflt = 0) => {
        const v = rec.get(k);
        const n = v && typeof v === 'object' && 'low' in v ? v.low : Number(v);
        return Number.isFinite(n) ? n : dflt;
      };
      const bool = (rec: any, k: string) => {
        const v = rec.get(k);
        return v === true;
      };
      const str = (rec: any, k: string, dflt = '') => {
        const v = rec.get(k);
        return typeof v === 'string' && v ? v : dflt;
      };
      const val = (rec: any, k: string) => {
        const v = rec.get(k);
        return v && typeof v === 'object' && 'low' in v ? v.low : v;
      };
      const solar: any[] = [];
      const wind: any[] = [];
      const batteries: any[] = [];
      assets.records.forEach((rec: any) => {
        const kind = str(rec, 'kind');
        const base = { id: str(rec, 'id'), name: str(rec, 'name'), status: str(rec, 'status') || 'online', currentOutputMw: num(rec, 'mw') };
        if (kind === 'solar') solar.push({ ...base, capacityMw: num(rec, 'cap', base.currentOutputMw) });
        else if (kind === 'wind') wind.push({ ...base, capacityMw: num(rec, 'cap', base.currentOutputMw), windSpeedMs: num(rec, 'ws'), gustWarning: bool(rec, 'gust') });
        else batteries.push({ ...base, capacityMwh: num(rec, 'capmwh'), powerRatingMw: num(rec, 'pr'), currentSocPct: num(rec, 'soc'), minSocPct: num(rec, 'min'), maxSocPct: num(rec, 'max', 100), targetPowerMw: 0 });
      });
      const busDem = bus.records[0] ? num(bus.records[0], 'dem', 0) : 0;
      return {
        solarFarms: solar,
        windFarms: wind,
        batteries,
        consumers: loads.records.map((rec: any) => ({ id: str(rec, 'id'), name: str(rec, 'name'), flexibleDemandMw: num(rec, 'flex'), baseloadDemandMw: num(rec, 'base'), totalDemandMw: num(rec, 'total'), status: str(rec, 'status') || 'normal' })),
        interties: lines.records.map((rec: any) => ({ id: str(rec, 'id'), name: str(rec, 'name'), limitMw: num(rec, 'limit'), currentFlowMw: num(rec, 'flow'), congested: bool(rec, 'congested') })),
        grid: { totalDemandMw: busDem, frequencyHz: 50, frequencyStatus: 'nominal' },
      };
    } finally {
      await session.close();
      await drv.close();
    }
  } catch (e: any) {
    console.warn('[graph] read-back failed, in-memory fallback:', String(e?.message || e).slice(0, 140));
    return null;
  }
}

/** Prune mirror nodes absent from the live portfolio (e.g. after modal deletes
 *  or renames — deletes never propagate automatically). Returns removed ids. */
export async function pruneOrphans(portfolio: any): Promise<{ removed: string[] }> {
  const cfg = driver();
  if (!cfg) throw new Error('no NEO4J_URI');
  const keep = new Set<string>([
    ...(portfolio.solarFarms || []).map((a: any) => a.id),
    ...(portfolio.windFarms || []).map((a: any) => a.id),
    ...(portfolio.batteries || []).map((a: any) => a.id),
    ...(portfolio.interties || []).map((a: any) => a.id),
    ...(portfolio.consumers || []).map((a: any) => a.id),
    'COLLECTOR',
  ]);
  const { default: neo4j } = await import('neo4j-driver' as any);
  const drv = neo4j.driver(cfg.uri, neo4j.auth.basic(cfg.user, cfg.pass), { connectionTimeout: 5000 });
  const session = drv.session();
  try {
    const res = await session.run(
      `MATCH (n)
       WHERE NOT n.id IN $keep AND (n:Asset OR n:Intertie OR n:Consumer)
       WITH n, n.id AS deletedId
       DETACH DELETE n
       RETURN deletedId AS id`,
      { keep: [...keep] },
      { timeout: 15000 },
    );
    return { removed: res.records.map((r: any) => String(r.get('id'))) };
  } finally {
    await session.close();
    await drv.close();
  }
}

export async function graphStatus(): Promise<{
  reachable: boolean;
  counts?: { nodes: number; rels: number; byLabel: Record<string, number> };
  error?: string;
}> {
  const cfg = driver();
  if (!cfg) return { reachable: false, error: 'no NEO4J_URI' };
  try {
    const { default: neo4j } = await import('neo4j-driver' as any);
    const drv = neo4j.driver(cfg.uri, neo4j.auth.basic(cfg.user, cfg.pass));
    const session = drv.session();
    try {
      const res = await session.run(
        `MATCH (n) WITH labels(n)[0] AS l, count(*) AS c RETURN l, c
         UNION ALL MATCH ()-[r]->() RETURN 'RELS' AS l, count(r) AS c`);
      const byLabel: Record<string, number> = {};
      let nodes = 0;
      let rels = 0;
      res.records.forEach((rec: any) => {
        const l = rec.get('l');
        const c = Number(rec.get('c'));
        if (l === 'RELS') rels = c;
        else { byLabel[l] = c; nodes += c; }
      });
      return { reachable: true, counts: { nodes, rels, byLabel } };
    } finally {
      await session.close();
      await drv.close();
    }
  } catch (e: any) {
    return { reachable: false, error: String(e?.message || e).slice(0, 160) };
  }
}
