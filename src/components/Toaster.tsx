import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  msg: string;
}

const ToastCtx = createContext<(msg: string, kind?: Toast['kind']) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind: Toast['kind'] = 'success') => {
    const id = nextId++;
    setToasts((prev) => [...prev.slice(-3), { id, kind, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);
  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] space-y-2 w-[320px] max-w-[calc(100vw-2rem)]" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-start gap-2 p-3 rounded-xl border shadow-lg bg-panel border-line text-xs text-paper"
          >
            {t.kind === 'success' && <CheckCircle2 className="w-4 h-4 text-em shrink-0 mt-px" />}
            {t.kind === 'error' && <AlertTriangle className="w-4 h-4 text-ro shrink-0 mt-px" />}
            {t.kind === 'info' && <Info className="w-4 h-4 text-cy shrink-0 mt-px" />}
            <span className="flex-1 leading-snug">{t.msg}</span>
            <button onClick={() => dismiss(t.id)} className="text-faint hover:text-paper" aria-label="Dismiss">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
