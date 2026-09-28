import React from 'react';
import { ShieldCheck, Eye, Lock } from 'lucide-react';
import { Permissions } from '../auth/ClerkWrapper';

const CAPS: Record<string, string> = {
  admin: 'Full control — dispatch, HITL approve, and all modifications (skills, RAG codex, DAG)',
  operator: 'Operate — dispatch, events, weights, thresholds, HITL approve. No config edits.',
  member: 'Operate — dispatch, events, weights, thresholds, HITL approve. No config edits.',
};

export const RoleBanner: React.FC<{ perms: Permissions }> = ({ perms }) => {
  const label = perms.local ? 'local-operator · admin' : (perms.role || 'no org role');
  const desc = perms.local ? CAPS.admin : (perms.role && CAPS[perms.role]) || 'Read-only — dashboards only. Select an org to activate a role.';
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs ${perms.isViewer ? 'bg-panel/70 border-line text-muted' : 'bg-panel/70 border-line text-soft'}`}>
      {perms.isViewer ? <Eye className="w-3.5 h-3.5 text-faint shrink-0" /> : perms.isAdmin ? <ShieldCheck className="w-3.5 h-3.5 text-pu shrink-0" /> : <ShieldCheck className="w-3.5 h-3.5 text-cy shrink-0" />}
      <span className="font-mono font-bold text-paper">{label}</span>
      <span aria-hidden="true" className="text-faintdeep">·</span>
      <span>{desc}</span>
      {perms.isViewer && (
        <span className="ml-auto flex items-center gap-1 font-mono text-[10px] text-am shrink-0"><Lock className="w-3 h-3" />READ-ONLY</span>
      )}
    </div>
  );
};
