import React, { useEffect, useState } from 'react';
import { FlaskConical, Play, CheckCircle2, XCircle, MinusCircle, ChevronDown } from 'lucide-react';
import { usePermissions } from '../auth/ClerkWrapper';
import { useToast } from './Toaster';

interface EvalCase {
  id: string;
  suite: 'deterministic' | 'llm';
  area?: string;
  areaLabel?: string;
  name: string;
  soWhat?: string;
  status?: 'pass' | 'fail' | 'skipped';
  ms?: number;
  detail?: string;
}

const AREA_ORDER = ['reasoning', 'safety', 'knowledge', 'access', 'data'];

/** Evaluation suites: deterministic always runs; LLM-judge auto-skips on dead quota. */
export const EvalPanel: React.FC = () => {
  const perms = usePermissions();
  const toast = useToast();
  const [cases, setCases] = useState<EvalCase[]>([]);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<{ pass: number; fail: number; skipped: number } | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ startedAt: string; summary: { pass: number; fail: number; skipped: number }; cases: Array<{ id: string; status: string }> }>>([]);
  const [prevFails, setPrevFails] = useState<Set<string>>(new Set());

  const loadHistory = async () => {
    try {
      const r = await fetch('/api/evals/history');
      const h = await r.json();
      if (Array.isArray(h)) setHistory(h);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetch('/api/evals').then((r) => r.json()).then((j) => {
      if (Array.isArray(j)) setCases(j);
    }).catch(() => {});
    loadHistory();
  }, []);

  const run = async () => {
    setRunning(true);
    try {
      const r = await fetch('/api/evals/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const j = await r.json();
      setCases(j.cases || []);
      setSummary(j.summary || null);
      setDurationMs(j.durationMs ?? null);
      setPrevFails(new Set((history[0]?.cases || []).filter((c) => c.status === 'fail').map((c) => c.id)));
      await loadHistory();
      if (j.summary?.fail > 0) toast(`${j.summary.fail} eval(s) failed — see details.`, 'error');
      else toast(`Evals: ${j.summary?.pass} pass, ${j.summary?.skipped} skipped${j.summary?.fail ? `, ${j.summary.fail} fail` : ''}.`, j.summary?.fail ? 'error' : 'success');
    } catch {
      toast('Eval run failed — backend unreachable.', 'error');
    } finally {
      setRunning(false);
    }
  };

  const pill = (s?: string) => s === 'pass'
    ? 'bg-emerald-500/10 text-em border-emerald-500/30'
    : s === 'fail'
      ? 'bg-rose-500/10 text-ro border-rose-500/40'
      : s === 'skipped'
        ? 'bg-raise text-faint border-linestrong'
        : 'bg-raise text-faint border-transparent';

  return (
    <div className="bg-panel border border-line rounded-xl p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-cy" />
          <div>
            <h3 className="text-sm font-semibold text-paper tracking-tight">Evaluation suites</h3>
            <p className="text-xs text-muted mt-0.5">
              Deterministic invariants run offline. LLM-judge cases auto-skip (never fail) when quotas are dead.
              {summary && (
                <span className="font-mono"> · {summary.pass} pass / {summary.fail} fail / {summary.skipped} skipped{durationMs !== null ? ` · ${(durationMs / 1000).toFixed(1)}s` : ''}</span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={run}
          disabled={running || !perms.canOperate}
          title={perms.canOperate ? 'Run all suites (LLM cases may take a minute)' : 'Requires Operator role or above'}
          className="px-3.5 py-1.5 text-xs font-semibold text-onaccent bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Play className="w-3.5 h-3.5" />
          <span>{running ? 'Running…' : 'Run evals'}</span>
        </button>
      </div>
      <div className="space-y-4">
        {cases.length === 0 && <p className="text-xs font-mono text-faint">No runs yet — press Run evals.</p>}
        {history.length > 1 && (
          <div className="font-mono text-[11px] text-muted flex items-center gap-2 flex-wrap">
            <span>Trend (last {Math.min(history.length, 5)} runs):</span>
            {history.slice(0, 5).reverse().map((h, i) => (
              <span key={i} title={`${h.startedAt} — ${h.summary.pass}p/${h.summary.fail}f/${h.summary.skipped}s`} className={`px-1.5 py-0.5 rounded border tabular-nums ${h.summary.fail > 0 ? 'bg-rose-500/10 border-rose-500/40 text-ro' : 'bg-emerald-500/10 border-emerald-500/30 text-em'}`}>
                {h.summary.pass}✓{h.summary.fail > 0 ? ` ${h.summary.fail}✗` : ''}
              </span>
            ))}
          </div>
        )}
        {AREA_ORDER.map((area) => {
          const group = cases.filter((c) => (c.area || 'reasoning') === area);
          if (group.length === 0) return null;
          const label = group[0].areaLabel || area;
          const fails = group.filter((c) => c.status === 'fail').length;
          return (
            <div key={area} className="space-y-1.5">
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-muted">
                <span>{label}</span>
                <span className="text-faint">· {group.length} checks{fails > 0 ? ` · ${fails} failing` : ''}</span>
              </div>
              {group.map((c) => (
          <div key={c.id} className="rounded-lg border border-line bg-page/60">
            <button onClick={() => setOpenId(openId === c.id ? null : c.id)} className="w-full flex items-center gap-2 p-2.5 text-left">
              {c.status === 'pass' ? <CheckCircle2 className="w-3.5 h-3.5 text-em shrink-0" />
                : c.status === 'fail' ? <XCircle className="w-3.5 h-3.5 text-ro shrink-0" />
                : <MinusCircle className="w-3.5 h-3.5 text-faint shrink-0" />}
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-paper truncate">
                  {c.name}
                  {c.status === 'fail' && !prevFails.has(c.id) && (
                    <span className="ml-1.5 font-mono text-[10px] font-bold text-ro">NEW</span>
                  )}
                </span>
                {c.soWhat && <span className="block text-[11px] text-faint truncate">{c.soWhat}</span>}
              </span>
              <span className="font-mono text-[10px] text-faint hidden sm:inline">{c.suite === 'llm' ? 'LLM' : 'DET'}</span>
              <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase ${pill(c.status)}`}>
                {c.status || 'pending'}
              </span>
              {typeof c.ms === 'number' && <span className="font-mono text-[10px] text-faint tabular-nums">{c.ms}ms</span>}
              <ChevronDown className={`w-3.5 h-3.5 text-faint transition-transform ${openId === c.id ? 'rotate-180' : ''}`} />
            </button>
            {openId === c.id && (
              <div className="px-3 pb-2.5 font-mono text-[11px] text-muted break-words">
                {c.detail || 'Not run yet.'}
              </div>
            )}
          </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};
