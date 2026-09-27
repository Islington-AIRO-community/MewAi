'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone: 'info' | 'success' | 'critical' | 'alert';
  action?: ToastAction;
  duration?: number;
}

interface ToastContextValue {
  toast: (t: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const TONE = {
  info: {
    bar: 'bg-dispatch-500',
    icon: 'bg-dispatch-50 text-dispatch-700 ring-dispatch-200',
    label: 'text-dispatch-700',
  },
  success: {
    bar: 'bg-relief-500',
    icon: 'bg-relief-50 text-relief-700 ring-relief-200',
    label: 'text-relief-700',
  },
  alert: {
    bar: 'bg-alert-500',
    icon: 'bg-alert-50 text-alert-800 ring-alert-200',
    label: 'text-alert-800',
  },
  critical: {
    bar: 'bg-emergency-500',
    icon: 'bg-emergency-50 text-emergency-700 ring-emergency-200',
    label: 'text-emergency-700',
  },
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = React.useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const toast = React.useCallback<ToastContextValue['toast']>(
    (t) => {
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setItems((prev) => [...prev.slice(-2), { ...t, id }]);
      const timer = setTimeout(() => dismiss(id), t.duration ?? 7000);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  React.useEffect(() => {
    const map = timers.current;
    return () => map.forEach(clearTimeout);
  }, []);

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex flex-col items-center gap-2 px-3 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:bottom-4 sm:right-4 sm:left-auto sm:items-end sm:px-0 sm:pb-0"
      >
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  return (
    <div
      role="status"
      className="pointer-events-auto flex w-full max-w-sm animate-slide-up gap-3 overflow-hidden rounded-xl border border-navy-200 bg-white p-3.5 shadow-lift"
    >
      <span className={cn('absolute left-0 top-0 h-full w-1', TONE[item.tone].bar)} aria-hidden="true" />
      <div className="min-w-0 flex-1 pl-1.5">
        <p className={cn('text-sm font-bold', TONE[item.tone].label)}>{item.title}</p>
        {item.description && (
          <p className="mt-0.5 text-sm leading-relaxed text-navy-600">{item.description}</p>
        )}
        {item.action && (
          <Button
            variant="link"
            size="xs"
            className="mt-1.5 px-0"
            onClick={() => {
              item.action?.onClick();
              onDismiss();
            }}
          >
            {item.action.label}
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        size="iconSm"
        onClick={onDismiss}
        srLabel="Dismiss notification"
        className="-mr-1 -mt-1 shrink-0 text-navy-400 hover:text-navy-700"
      >
        <span aria-hidden="true">&times;</span>
      </Button>
    </div>
  );
}
