import fs from 'fs';
import path from 'path';
import { readJson, writeJsonAtomic } from './store.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, 'data');
const RAG_FILE = path.join(DATA_DIR, 'rag_docs.json');

export interface RagDoc {
  id: string;
  title: string;
  category: 'ASSET_SPEC' | 'REGULATORY_STANDARD' | 'HISTORICAL_CASE' | 'ANOMALY_SIGNATURE';
  summary: string;
  content: string;
  relevanceTags: string[];
  updatedAt: string;
  updatedBy?: string;
}

const SEED: RagDoc[] = [
  { id: 'RAG-ASSET-01', title: 'BESS-01 Alpha: LFP Operational Limits', category: 'ASSET_SPEC', summary: '50 MW / 200 MWh LFP storage bounds, C-rate, thermal derating, cycle life.', content: 'Chemistry LiFePO4. Rated 50MW continuous. Capacity 200MWh. Roundtrip 92.4% at 0.5C. SOC range 12-95%. Emergency floor 15%. Degradation 0.00015%/cycle. Thermal: nominal 20-30C, cooling >35C, derate 25% >45C, trip >55C. Ideal for daily peak shaving.', relevanceTags: ['BESS-01', 'LFP', 'battery', 'soc'], updatedAt: new Date().toISOString() },
  { id: 'RAG-ASSET-02', title: 'BESS-02 Beta: NMC Characteristics', category: 'ASSET_SPEC', summary: '40 MW / 160 MWh NMC, strict thermal bounds, 1.46x degradation penalty.', content: 'Chemistry NMC811. Rated 40MW. Capacity 160MWh. Roundtrip 88.2%. SOC 15-92%. Floor 20%. Degradation 0.00022%/cycle. Sensitive to calendar aging above 90% SOC. Reserve for high-margin spikes.', relevanceTags: ['BESS-02', 'NMC', 'battery', 'degradation'], updatedAt: new Date().toISOString() },
  { id: 'RAG-ASSET-03', title: 'Solar Fleet: Tracking & Inverter Clipping', category: 'ASSET_SPEC', summary: '5 solar farms, 200MW aggregate, <2.5s curtailment response.', content: 'Desert Sun 50MW tracking bifacial; Solaria West 45MW ILR 1.25; Valley Light 35MW fixed; Mesa Horizon 40MW; High Plains 30MW. Fast active-power curtailment <2.5s per IEEE 1547.', relevanceTags: ['solar', 'curtailment', 'inverter'], updatedAt: new Date().toISOString() },
  { id: 'RAG-ASSET-04', title: 'Wind Fleet: Cut-In / Cut-Out Control', category: 'ASSET_SPEC', summary: '3 wind farms 200MW: cut-in 3.5, rated 11.5, cut-out 25 m/s.', content: 'Ridge Crest 60MW, Columbia Gorge 75MW, Coastal Breeze 65MW. Pitch control above 22 m/s sustained. Full cutout 25 m/s. Pre-ramp batteries on gust alerts.', relevanceTags: ['wind', 'gust', 'storm'], updatedAt: new Date().toISOString() },
  { id: 'RAG-REG-01', title: 'IEEE 1547-2018 DER Interconnection', category: 'REGULATORY_STANDARD', summary: 'Frequency droop, curtailment, anti-islanding mandates.', content: 'Over-frequency >50.10Hz decrease output (5% droop) or charge. Under-frequency <49.90Hz increase output within 500ms. Anti-islanding trip within 2.0s. THD <5% at PCC.', relevanceTags: ['IEEE-1547', 'frequency', 'regulatory'], updatedAt: new Date().toISOString() },
  { id: 'RAG-REG-02', title: 'FERC 888 & NERC BAL-001 Congestion Rules', category: 'REGULATORY_STANDARD', summary: 'Tie-line SOL enforcement and curtailment merit order.', content: 'Line North 150MW, South 120MW. 98% triggers alarm; 100%+ for 15min = $25k/hr penalty + relay trip risk. Merit order: charge locally, DR, curtail.', relevanceTags: ['FERC', 'NERC', 'transmission', 'congestion'], updatedAt: new Date().toISOString() },
  { id: 'RAG-HIST-01', title: 'Heatwave Price Spike July 2025', category: 'HISTORICAL_CASE', summary: 'Aggressive discharge at $395/MWh saved $28.4k in 1hr.', content: 'BESS-Alpha 45MW + Beta 35MW, export 62MW, DR 12MW shed. SOC 78->32%, above floor. Lesson: dispatch early ahead of plateau.', relevanceTags: ['price spike', 'arbitrage', 'historical'], updatedAt: new Date().toISOString() },
  { id: 'RAG-HIST-02', title: 'Negative Pricing Wind Ramp Nov 2025', category: 'HISTORICAL_CASE', summary: 'Charging absorbed 72MWh at -$22/MWh.', content: 'Both BESS max charge (-50/-40MW), SOC 25->88%. Avoided $3.8k curtailment penalty + $1.98k charging payment. Discharged next morning at $65.', relevanceTags: ['negative price', 'wind', 'charging'], updatedAt: new Date().toISOString() },
  { id: 'RAG-ANOM-01', title: 'Cloud Front Ramp Signature', category: 'ANOMALY_SIGNATURE', summary: '>50MW solar loss in <10min predictor.', content: 'Pyranometer slope <-35 W/m2/min + satellite +40% cloud in 15min. Mitigate: hot-standby converters, pre-notify DR, inhibit South exports.', relevanceTags: ['cloud', 'solar ramp', 'anomaly'], updatedAt: new Date().toISOString() },
  { id: 'RAG-ANOM-02', title: 'Under-Frequency Droop Precursor', category: 'ANOMALY_SIGNATURE', summary: 'RoCoF < -0.12 Hz/s triggers FFR in 250ms.', content: 'Immediate: inhibit charging, grid-forming droop mode, inject active power. Mandatory FFR.', relevanceTags: ['frequency', 'RoCoF', 'FFR'], updatedAt: new Date().toISOString() },
];

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadRagDocs(): RagDoc[] {
  ensure();
  return readJson<RagDoc[]>(RAG_FILE, () => SEED);
}

export function saveRagDocs(docs: RagDoc[]) {
  ensure();
  writeJsonAtomic(RAG_FILE, docs);
}

function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9.]+/).filter((t) => t.length > 2 && !STOP.has(t));
}

const STOP = new Set(
  'the,and,for,with,from,that,this,into,per,are,was,were,has,have,had,not,but,all,any,can,its,per,via,within,across,under,over,between,each,more,most,such,than,then,when,while,where,also,using,used,based,both,either,neither,north,south,east,west'.split(','),
);

/** TF-IDF cosine retrieval (offline, deterministic). Replaces keyword overlap. */
export function searchRag(query: string, topK = 5): Array<RagDoc & { score: number }> {
  const docs = loadRagDocs();
  const texts = docs.map((d) => `${d.title} ${d.summary} ${d.content} ${d.relevanceTags.join(' ')}`);
  const docTokens = texts.map(tokens);
  const df = new Map<string, number>();
  docTokens.forEach((toks) => new Set(toks).forEach((t) => df.set(t, (df.get(t) || 0) + 1)));
  const N = docs.length;
  const idf = (t: string) => Math.log((N + 1) / ((df.get(t) || 0) + 1)) + 1;

  const qToks = tokens(query + ' ieee bess solar wind frequency congestion price battery');
  const qTf = new Map<string, number>();
  qToks.forEach((t) => qTf.set(t, (qTf.get(t) || 0) + 1));
  let qNorm = 0;
  const qW = new Map<string, number>();
  qTf.forEach((tf, t) => { const w = tf * idf(t); qW.set(t, w); qNorm += w * w; });
  qNorm = Math.sqrt(qNorm) || 1;

  const scored = docs.map((d, i) => {
    const tf = new Map<string, number>();
    docTokens[i].forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
    let dot = 0;
    let dNorm = 0;
    tf.forEach((f, t) => {
      const w = f * idf(t);
      dNorm += w * w;
      const qw = qW.get(t);
      if (qw) dot += qw * w;
    });
    const cosine = dot / (qNorm * (Math.sqrt(dNorm) || 1));
    const tagBonus = d.relevanceTags.filter((t) => query.toLowerCase().includes(t.toLowerCase())).length * 0.15;
    return { ...d, score: Math.round((cosine + tagBonus) * 1000) / 1000 };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}
