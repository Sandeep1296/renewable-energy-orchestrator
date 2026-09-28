import React, { createContext, useContext, useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

export type ThemeChoice = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

const STORAGE_KEY = 're-theme';

function resolveSystem(): ResolvedTheme {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function loadChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'dark';
  } catch {
    return 'dark';
  }
}

const ThemeCtx = createContext<{ theme: ThemeChoice; resolved: ResolvedTheme; setTheme: (t: ThemeChoice) => void }>({
  theme: 'dark',
  resolved: 'dark',
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(loadChoice);
  const [resolved, setResolved] = useState<ResolvedTheme>('dark');

  useEffect(() => {
    const apply = () => {
      const r = theme === 'system' ? resolveSystem() : theme;
      setResolved(r);
      try {
        document.documentElement.dataset.theme = r;
      } catch { /* ignore */ }
    };
    apply();
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: light)');
      const onChange = () => apply();
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
  }, [theme]);

  const setTheme = (t: ThemeChoice) => {
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch { /* ignore */ }
    setThemeState(t);
  };

  return <ThemeCtx.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}

const ORDER: ThemeChoice[] = ['dark', 'light', 'system'];

/** Compact header switcher: dark → light → system → dark. */
export function ThemeToggle() {
  const { theme, resolved, setTheme } = useTheme();
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  const Icon = resolved === 'light' ? Sun : theme === 'system' ? Monitor : Moon;
  return (
    <button
      onClick={() => setTheme(next)}
      title={`Theme: ${theme} (click for ${next})`}
      className="p-1.5 text-muted hover:text-paper bg-panel border border-line rounded transition-colors"
    >
      <span className="flex items-center gap-1">
        <Icon className="w-3.5 h-3.5" />
        {theme === 'system' && <span className="text-[9px] font-mono hidden md:inline">auto</span>}
      </span>
    </button>
  );
}
