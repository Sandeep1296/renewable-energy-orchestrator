import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  storageKey: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/** Minimizable section with persisted open state. */
export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  storageKey, title, subtitle, icon, badge, defaultOpen = true, children,
}) => {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(`re-section:${storageKey}`);
      return v === null ? defaultOpen : v === '1';
    } catch {
      return defaultOpen;
    }
  });
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(`re-section:${storageKey}`, o ? '0' : '1');
      } catch { /* ignore */ }
      return !o;
    });
  };
  return (
    <div>
      <button
        onClick={toggle}
        aria-expanded={open}
        className={`w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors border border-line ${open ? 'rounded-t-xl bg-raise/40 border-b-0' : 'rounded-xl bg-panel hover:bg-raise/40'}`}
      >
        {icon}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-paper tracking-tight truncate">{title}</span>
          {!open && subtitle && <span className="block text-[11px] text-faint truncate mt-0.5">{subtitle}</span>}
        </span>
        {badge}
        <ChevronDown className={`w-4 h-4 text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="pt-3">{children}</div>}
    </div>
  );
};
