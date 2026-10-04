import React, { useEffect, useState } from 'react';
import { ShieldCheck, Save, History } from 'lucide-react';
import { authHeaders, useIsAdmin } from '../auth/ClerkWrapper';
import { useToast } from './Toaster';

interface Policy {
  powerBalanceToleranceMw: number;
  batteryPowerHeadroomMw: number;
  n1GateEnabled?: boolean;
  n1UnservedThresholdMw?: number;
}

/** Admin-editable grounding tolerances. Physical law stays hardcoded;
 *  only sensitivity bands are tunable — and every change is audit-logged. */
export const GroundingPolicyPanel: React.FC = () => {
  const admin = useIsAdmin();
  const toast = useToast();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [bounds, setBounds] = useState<Record<string, [number, number]>>({});
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Partial<Policy>>({});
  const [history, setHistory] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<Record<string, { label: string; unit: string }>>({});
  const [newRule, setNewRule] = useState({ name: '', category: 'GRID_CONSTRAINT', severity: 'WARN', metric: 'intertie_max_load_pct', op: '>=', value: '95', message: '' });

  const load = async () => {
    try {
      const r = await fetch('/api/grounding/config');
      const j = await r.json();
      if (j.policy) {
        setPolicy(j.policy);
        setBounds(j.bounds || {});
        setDescriptions(j.descriptions || {});
        setDraft({});
      }
      if (Array.isArray(j.customRules)) setRules(j.customRules);
      if (j.metrics) setMetrics(j.metrics);
    } catch { /* offline */ }
    try {
      const r = await fetch('/api/audit/log');
      const log = await r.json();
      if (Array.isArray(log)) setHistory(log.filter((e: any) => ['GROUNDING_UPDATED', 'GROUNDING_RULE_CREATED', 'GROUNDING_RULE_DELETED'].includes(e.type)).slice(0, 12));
    } catch { /* offline */ }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!admin || Object.keys(draft).length === 0) return;
    setSaving(true);
    try {
      const h = await authHeaders();
      const r = await fetch('/api/grounding/config', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(draft) });
      const j = await r.json();
      if (r.ok) {
        setPolicy(j.policy);
        setDraft({});
        toast('Grounding policy updated — change recorded in audit ledger.', 'success');
        await load();
      } else {
        toast(`Rejected: ${j.error || r.status} (bounds enforced server-side).`, 'error');
      }
    } catch {
      toast('Save failed — backend unreachable.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const rows: Array<{ key: 'powerBalanceToleranceMw' | 'batteryPowerHeadroomMw'; label: string; unit: string }> = [
    { key: 'powerBalanceToleranceMw', label: 'First-law residual tolerance', unit: 'MW' },
    { key: 'batteryPowerHeadroomMw', label: 'Inverter headroom', unit: 'MW' },
  ];
  const n1On = (draft as any).n1GateEnabled ?? (policy as any)?.n1GateEnabled ?? true;
  const n1Threshold = (draft as any).n1UnservedThresholdMw ?? (policy as any)?.n1UnservedThresholdMw ?? 25;

  return (
    <div className="bg-panel border border-line rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-em" />
        <div>
          <h3 className="text-sm font-semibold text-paper tracking-tight">Grounding policy (admin-tunable)</h3>
          <p className="text-xs text-muted mt-0.5">
            Only sensitivity bands are editable — physical law (conservation, SOL, IEEE-1547 bands, fault isolation) is hardcoded and cannot be changed here. Every edit is audit-logged with who/when/old→new.
          </p>
        </div>
      </div>
      {!policy && <p className="text-xs text-faint font-mono">Loading policy…</p>}
      {policy && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map(({ key, label, unit }) => {
            const [lo, hi] = bounds[key] || [0, 100];
            const val = draft[key] ?? policy[key];
            return (
              <div key={key} className="p-3 rounded-lg bg-page border border-line space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-paper">{label}</span>
                  <span className="font-mono text-cy tabular-nums">{val} {unit}</span>
                </div>
                <input
                  type="range"
                  min={lo}
                  max={hi}
                  step={key === 'powerBalanceToleranceMw' ? 0.1 : 0.05}
                  value={val}
                  disabled={!admin}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: parseFloat(e.target.value) }))}
                  className="w-full h-1.5 bg-raise rounded appearance-none cursor-pointer accent-emerald-500 disabled:opacity-50"
                />
                <div className="flex justify-between text-[10px] font-mono text-faint">
                  <span>min {lo}</span>
                  <span className="text-soft">{descriptions[key]}</span>
                  <span>max {hi}</span>
                </div>
              </div>
            );
          })}
          {/* N-1 contingency gate toggle + threshold */}
          <div className="p-3 rounded-lg bg-page border border-line space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-paper">N-1 contingency screen</span>
              <button
                onClick={() => admin && setDraft((d) => ({ ...d, n1GateEnabled: !n1On }))}
                disabled={!admin}
                title={admin ? 'Toggle N-1 screening (audited)' : 'Requires Admin org role'}
                className={`px-2.5 py-1 text-[11px] font-bold rounded transition-colors disabled:opacity-50 ${n1On ? 'bg-emerald-500/15 text-em border border-emerald-500/30' : 'bg-raise text-faint border border-linestrong'}`}
              >
                {n1On ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted whitespace-nowrap">Fail above</span>
              <input
                type="range" min="0" max="200" step="5" value={n1Threshold}
                disabled={!admin || !n1On}
                onChange={(e) => setDraft((d) => ({ ...d, n1UnservedThresholdMw: parseFloat(e.target.value) }))}
                className="flex-1 h-1.5 bg-raise rounded appearance-none cursor-pointer accent-emerald-500 disabled:opacity-50"
              />
              <span className="font-mono text-cy tabular-nums whitespace-nowrap">{n1Threshold} MW</span>
            </div>
            <p className="text-[10px] font-mono text-faint">Worst single asset/intertie loss leaving more unserved fails the plan. Off skips silently — demo-safe.</p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono text-faint">
          {Object.keys(draft).length > 0 ? 'Unsaved changes — next dispatch and approval gates use the saved policy.' : admin ? 'Drag a slider, then save. Bounds are enforced server-side.' : 'Read-only for your role.'}
        </span>
        {admin && (
          <button onClick={save} disabled={saving || Object.keys(draft).length === 0} className="px-3 py-1.5 text-xs font-semibold text-onaccent bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg flex items-center gap-1.5">
            <Save className="w-3.5 h-3.5" />
            <span>{saving ? 'Saving…' : 'Save policy'}</span>
          </button>
        )}
      </div>
      {history.length > 0 && (
        <div className="pt-2 border-t border-line space-y-1.5">
          <div className="text-[11px] font-mono text-muted uppercase tracking-wider flex items-center gap-1">
            <History className="w-3 h-3" /> Change history (who · when · old → new)
          </div>
          {history.map((e, i) => (
            <div key={i} className="text-[11px] font-mono text-muted">
              <span className="text-paper">{e.by}</span> · {String(e.at).slice(0, 19).replace('T', ' ')} ·{' '}
              {e.type === 'GROUNDING_UPDATED'
                ? Object.entries(e.changes || {}).map(([k, v]: any) => `${k}: ${v[0]} → ${v[1]}`).join('; ')
                : e.type === 'GROUNDING_RULE_CREATED'
                  ? `created rule ${e.id} (${(e.rule as any)?.name})`
                  : `deleted rule ${e.id} (${(e.rule as any)?.name || '?'})`}
            </div>
          ))}
        </div>
      )}

      {/* Custom grounding rules: add + delete (Admin, audited) */}
      <div className="pt-2 border-t border-line space-y-3">
        <div className="text-xs font-semibold text-paper">
          Custom grounding rules
          <span className="block text-[11px] font-normal text-muted mt-0.5">
            Metric-threshold rules evaluated with the built-ins on every plan. FAIL blocks like any hard gate. Built-ins cannot be deleted — only GRD-CUSTOM-* rules.
          </span>
        </div>
        {rules.length === 0 && <p className="text-[11px] font-mono text-faint">No custom rules. Built-in gates only.</p>}
        {rules.map((r) => (
          <div key={r.id} className="p-2.5 rounded-lg bg-page border border-line flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-paper truncate">{r.name} <span className="font-mono text-[10px] text-faint">{r.id}</span></div>
              <div className="text-[11px] font-mono text-muted truncate">
                IF {(r.conditions || []).map((c: any) => `${c.metric} ${c.op} ${c.value}`).join(' AND ')} → <span className={r.severity === 'FAIL' ? 'text-ro font-bold' : 'text-am font-bold'}>{r.severity}</span>
                <span className="text-faint"> · by {r.createdBy || 'unknown'}</span>
              </div>
            </div>
            {admin && (
              <button
                onClick={async () => {
                  if (!confirm(`Delete custom rule ${r.id} (${r.name})? Built-in gates are unaffected. This is audit-logged.`)) return;
                  const h = await authHeaders();
                  const resp = await fetch(`/api/grounding/rules/${r.id}`, { method: 'DELETE', headers: h });
                  if (resp.ok) { toast(`Deleted rule ${r.id}.`, 'info'); await load(); }
                  else toast(`Delete failed: ${(await resp.json()).error || resp.status}.`, 'error');
                }}
                className="px-2 py-1 text-[11px] text-ro hover:bg-rose-500/10 rounded border border-transparent hover:border-rose-500/30 shrink-0"
              >
                Delete
              </button>
            )}
          </div>
        ))}
        {admin && (
          <div className="p-3 rounded-lg bg-page/60 border border-line space-y-2">
            <div className="text-[11px] font-semibold text-soft">Add rule (single metric threshold)</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <input value={newRule.name} onChange={(e) => setNewRule({ ...newRule, name: e.target.value })} placeholder="Rule name" className="bg-panel border border-linestrong rounded px-2 py-1.5 text-paper placeholder-faint col-span-2 sm:col-span-1" />
              <select value={newRule.severity} onChange={(e) => setNewRule({ ...newRule, severity: e.target.value })} className="bg-panel border border-linestrong rounded px-2 py-1.5 text-paper">
                <option value="WARN">WARN</option>
                <option value="FAIL">FAIL (blocks)</option>
              </select>
              <select value={newRule.metric} onChange={(e) => setNewRule({ ...newRule, metric: e.target.value })} className="bg-panel border border-linestrong rounded px-2 py-1.5 text-paper">
                {Object.entries(metrics).map(([k, v]) => (<option key={k} value={k}>{v.label} ({v.unit})</option>))}
              </select>
              <select value={newRule.op} onChange={(e) => setNewRule({ ...newRule, op: e.target.value })} className="bg-panel border border-linestrong rounded px-2 py-1.5 text-paper font-mono">
                <option value=">">&gt;</option><option value=">=">&gt;=</option><option value="<">&lt;</option><option value="<=">&lt;=</option>
              </select>
              <input type="number" value={newRule.value} onChange={(e) => setNewRule({ ...newRule, value: e.target.value })} placeholder="value" className="bg-panel border border-linestrong rounded px-2 py-1.5 text-paper font-mono" />
              <input value={newRule.message} onChange={(e) => setNewRule({ ...newRule, message: e.target.value })} placeholder="Message (optional)" className="bg-panel border border-linestrong rounded px-2 py-1.5 text-paper placeholder-faint col-span-2 sm:col-span-1" />
            </div>
            <button
              onClick={async () => {
                const h = await authHeaders();
                const r = await fetch('/api/grounding/rules', {
                  method: 'POST', headers: { 'Content-Type': 'application/json', ...h },
                  body: JSON.stringify({ name: newRule.name, category: 'GRID_CONSTRAINT', severity: newRule.severity, message: newRule.message, conditions: [{ metric: newRule.metric, op: newRule.op, value: parseFloat(newRule.value) }] }),
                });
                if (r.ok) {
                  const created = await r.json();
                  toast(`Rule ${created.id} created — live on next plan.`, 'success');
                  setNewRule({ name: '', category: 'GRID_CONSTRAINT', severity: 'WARN', metric: 'intertie_max_load_pct', op: '>=', value: '95', message: '' });
                  await load();
                } else toast(`Create failed: ${(await r.json()).error || r.status}.`, 'error');
              }}
              disabled={!newRule.name.trim() || newRule.value === ''}
              className="px-3 py-1.5 text-xs font-semibold text-onaccent bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg"
            >
              Add custom rule
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
