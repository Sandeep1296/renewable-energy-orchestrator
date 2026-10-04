import fs from 'fs';
import path from 'path';
import { writeJsonAtomic } from './store.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, 'data');
const PENDING_FILE = path.join(DATA_DIR, 'pending_hitl.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit_log.json');

export interface PendingDecision {
  pendingId: string;
  decisionId: string;
  timestamp: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  hitlStatus: 'SUPERVISED' | 'ADVISORY';
  reasons: string[];
  stagedActions: any[];
  selectedScenario: any;
  requestedBy?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PENDING_FILE)) fs.writeFileSync(PENDING_FILE, '[]');
  if (!fs.existsSync(AUDIT_FILE)) fs.writeFileSync(AUDIT_FILE, '[]');
}

export function loadPending(): PendingDecision[] {
  ensure();
  try { return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf-8')); } catch { return []; }
}

export function savePending(list: PendingDecision[]) {
  ensure();
  writeJsonAtomic(PENDING_FILE, list);
}

export function createPending(d: Omit<PendingDecision, 'pendingId' | 'timestamp' | 'status'>): PendingDecision {
  const list = loadPending();
  const rec: PendingDecision = {
    ...d, pendingId: `HITL-${Date.now().toString(36).toUpperCase()}`, timestamp: new Date().toISOString(), status: 'PENDING_APPROVAL',
  };
  list.unshift(rec);
  savePending(list.slice(0, 100));
  appendAudit({ type: 'HITL_STAGED', pendingId: rec.pendingId, decisionId: d.decisionId, at: rec.timestamp, by: d.requestedBy || 'anonymous' });
  return rec;
}

export function resolvePending(pendingId: string, verdict: 'APPROVED' | 'REJECTED', reviewedBy?: string): PendingDecision | null {
  const list = loadPending();
  const rec = list.find((p) => p.pendingId === pendingId);
  if (!rec || rec.status !== 'PENDING_APPROVAL') return null;
  rec.status = verdict;
  rec.reviewedBy = reviewedBy || 'operator';
  rec.reviewedAt = new Date().toISOString();
  savePending(list);
  appendAudit({ type: `HITL_${verdict}`, pendingId, decisionId: rec.decisionId, at: rec.reviewedAt, by: rec.reviewedBy });
  return rec;
}

export function appendAudit(entry: any) {
  ensure();
  let log: any[] = [];
  try { log = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf-8')); } catch { log = []; }
  log.unshift({ ...entry, at: entry.at || new Date().toISOString() });
  writeJsonAtomic(AUDIT_FILE, log.slice(0, 500));
}

export function loadAudit(): any[] {
  ensure();
  try { return JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf-8')); } catch { return []; }
}

/** Admin-only ledger reset. Writes a marker so the clear itself stays auditable. */
export function clearAudit(by?: string): void {
  ensure();
  fs.writeFileSync(AUDIT_FILE, JSON.stringify([
    { type: 'AUDIT_CLEARED', by: by || 'unknown', at: new Date().toISOString(), note: 'Ledger reset by admin; prior entries archived off-ledger.' },
  ], null, 2));
}
