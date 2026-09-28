import React from 'react';
import { ShieldCheck, CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { GroundingCheck } from '../types/orchestrator';

interface GroundingAndSafetyPanelProps {
  checks: GroundingCheck[];
}

export const GroundingAndSafetyPanel: React.FC<GroundingAndSafetyPanelProps> = ({ checks }) => {
  const allPass = checks.every((c) => c.status === 'PASS');
  const failCount = checks.filter((c) => c.status === 'FAIL').length;
  const warnCount = checks.filter((c) => c.status === 'WARN').length;

  return (
    <div className="bg-panel border border-line rounded-xl p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-line">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-em" />
          <h3 className="text-sm font-semibold text-paper tracking-tight">
            Physical & Regulatory Grounding Validation
          </h3>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          {allPass ? (
            <span className="text-em font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> All Grounding Rules Verified
            </span>
          ) : (
            <span className="text-am font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              {failCount > 0 ? `${failCount} Violations` : `${warnCount} Warnings`}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        {checks.map((check) => {
          const isPass = check.status === 'PASS';
          const isWarn = check.status === 'WARN';
          const isFail = check.status === 'FAIL';

          return (
            <div
              key={check.id}
              className={`p-3 rounded-lg border space-y-1.5 transition-colors ${
                isPass
                  ? 'bg-page/70 border-line'
                  : isWarn
                  ? 'bg-amber-950/20 border-amber-500/40'
                  : 'bg-rose-950/20 border-rose-500/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {isPass && <CheckCircle2 className="w-3.5 h-3.5 text-em shrink-0" />}
                  {isWarn && <AlertTriangle className="w-3.5 h-3.5 text-am shrink-0" />}
                  {isFail && <XCircle className="w-3.5 h-3.5 text-ro shrink-0" />}
                  <span className="font-semibold text-paper">{check.category}</span>
                </div>
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-bold ${
                    isPass
                      ? 'bg-emerald-500/10 text-em'
                      : isWarn
                      ? 'bg-amber-500/20 text-am'
                      : 'bg-rose-500/20 text-ro'
                  }`}
                >
                  {check.status}
                </span>
              </div>

              <div className="text-[11px] text-soft font-medium">{check.rule}</div>
              <div className="text-[11px] text-muted font-mono">{check.detail}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
