/**
 * Live DAG progress: records node start/finish timestamps per orchestration run
 * so the UI can render real execution progress (not simulated animation).
 * Single-process in-memory ring (fine for demo scale; reset on restart).
 */

export interface NodeProgress {
  status: 'running' | 'completed' | 'failed' | 'skipped';
  atMs: number;
}

export interface RunProgress {
  runId: string;
  startedAt: number;
  done: boolean;
  states: Record<string, NodeProgress>;
}

let current: RunProgress | null = null;

export function startRun(): string {
  const runId = `RUN-${Date.now().toString(36).toUpperCase()}`;
  current = { runId, startedAt: Date.now(), done: false, states: {} };
  return runId;
}

export function recordNode(nodeId: string, status: NodeProgress['status']) {
  if (!current) return;
  current.states[nodeId] = { status, atMs: Date.now() - current.startedAt };
  if (['completed', 'failed'].includes(status)) {
    // node finished; run ends when terminal audit node completes
    if (nodeId === 'DAG-12') current.done = true;
  }
}

export function finishRun() {
  if (current) current.done = true;
}

export function getProgress(): RunProgress | null {
  return current;
}
