import React, { useEffect, useState } from 'react';
import { Brain, Save, RotateCcw, Lock } from 'lucide-react';
import { authHeaders, useIsAdmin } from '../auth/ClerkWrapper';
import { useToast } from './Toaster';

interface Skill {
  id: string; name: string; agentId: string; category: string;
  description: string; promptFragment: string; enabled: boolean; version: string;
}

export const AgentSkillsPanel: React.FC = () => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [live, setLive] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const admin = useIsAdmin();
  const toast = useToast();

  const load = async () => {
    try {
      const r = await fetch('/api/skills');
      if (!r.ok) throw new Error();
      setSkills(await r.json());
      setLive(true);
    } catch { setLive(false); }
  };
  useEffect(() => { load(); }, []);

  const toggle = async (s: Skill) => {
    setSaving(s.id);
    const h = await authHeaders();
    const r = await fetch(`/api/skills/${s.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...h },
      body: JSON.stringify({ enabled: !s.enabled }),
    });
    if (r.ok) setSkills((prev) => prev.map((x) => (x.id === s.id ? { ...x, enabled: !x.enabled } : x)));
    else toast((await r.json()).error || 'Update failed', 'error');
    setSaving(null);
  };

  const savePrompt = async (s: Skill, promptFragment: string) => {
    setSaving(s.id);
    const h = await authHeaders();
    const r = await fetch(`/api/skills/${s.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...h },
      body: JSON.stringify({ promptFragment }),
    });
    if (r.ok) {
      setSkills((prev) => prev.map((x) => (x.id === s.id ? { ...x, promptFragment } : x)));
      toast(`Skill ${s.id} directive updated — live on next dispatch.`, 'success');
    } else toast('Save failed — Admin role required.', 'error');
    setSaving(null);
  };

  const byAgent = skills.reduce<Record<string, Skill[]>>((m, s) => {
    m[s.agentId] = [...(m[s.agentId] || []), s];
    return m;
  }, {});

  return (
    <div className="bg-panel border border-line rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-line">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-pu" />
          <h3 className="text-sm font-semibold text-paper">Agent Skills Registry</h3>
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${live ? 'bg-emerald-500/15 text-em' : 'bg-amber-500/15 text-am'}`}>{live ? 'BACKEND LIVE' : 'OFFLINE'}</span>
        </div>
        <button onClick={load} className="p-1.5 text-muted hover:text-paper"><RotateCcw className="w-3.5 h-3.5" /></button>
      </div>
      <p className="text-xs text-muted">Toggle skills or rewrite each agent's reasoning directive. Safety guardrails (PHYSICAL_GROUNDING, REGULATORY_COMPLIANCE) cannot be disabled.{!admin && ' Editing requires the Admin org role.'}</p>
      {Object.entries(byAgent).map(([agent, list]) => (
        <div key={agent} className="space-y-2">
          <div className="text-[11px] font-mono text-pu font-bold">{agent}</div>
          {list.map((s) => (
            <div key={s.id} className="p-3 rounded-lg bg-page border border-line space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-semibold text-paper">{s.name}</span>
                  <span className="text-[10px] font-mono text-faint ml-2">{s.id} · v{s.version}</span>
                  <p className="text-[11px] text-muted">{s.description}</p>
                </div>
                <button
                  onClick={() => toggle(s)}
                  disabled={saving === s.id || !admin}
                  title={admin ? 'Toggle skill' : 'Requires Admin org role'}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors disabled:opacity-50 ${s.enabled ? 'bg-emerald-500/15 text-em border border-emerald-500/30' : 'bg-raise text-muted'}`}
                >
                  {!admin && <Lock className="w-3 h-3 inline mr-1" />}{s.enabled ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>
              <textarea
                defaultValue={s.promptFragment}
                rows={2}
                disabled={!admin}
                onBlur={(e) => { if (admin && e.target.value !== s.promptFragment) savePrompt(s, e.target.value); }}
                className="w-full bg-panel border border-line rounded px-2.5 py-1.5 text-[11px] font-mono text-soft focus:border-purple-500 focus:outline-none disabled:opacity-60"
              />
              <div className="text-[10px] font-mono text-faintdeep flex items-center gap-1"><Save className="w-3 h-3" />Edits save on blur · take effect next dispatch cycle</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
