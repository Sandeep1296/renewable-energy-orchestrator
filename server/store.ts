import fs from 'fs';
import path from 'path';

/**
 * Crash-safe JSON persistence for runtime stores (skills, RAG, DAG, HITL).
 * - Atomic: write temp file + fsync + rename (a crash never leaves half-written JSON).
 * - One rotating backup (<file>.bak) so a bad write is recoverable.
 * - Corrupt reads fall back to the caller-supplied seed instead of throwing.
 */
export function readJson<T>(file: string, seed: () => T): T {
  try {
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (Array.isArray(raw) ? raw.length > 0 : raw && Object.keys(raw).length > 0) return raw as T;
    }
  } catch (e) {
    console.warn(`[store] ${path.basename(file)} unreadable — reseeding:`, String((e as any)?.message || e).slice(0, 120));
    try {
      if (fs.existsSync(`${file}.bak`)) {
        const bak = JSON.parse(fs.readFileSync(`${file}.bak`, 'utf-8'));
        console.warn(`[store] recovered ${path.basename(file)} from .bak`);
        return bak as T;
      }
    } catch { /* fall through to seed */ }
  }
  const fresh = seed();
  try {
    writeJsonAtomic(file, fresh);
  } catch { /* best effort */ }
  return fresh;
}

export function writeJsonAtomic(file: string, data: unknown): void {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(file)) {
    try {
      fs.copyFileSync(file, `${file}.bak`);
    } catch { /* ignore backup errors */ }
  }
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, JSON.stringify(data, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}
