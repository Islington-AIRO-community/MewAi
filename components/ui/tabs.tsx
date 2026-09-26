'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type Div = React.HTMLAttributes<HTMLDivElement>;

interface TabsContextValue {
  value: string;
  setValue: (v: string) => void;
  idPrefix: string;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabs(component: string) {
  const ctx = React.useContext(TabsContext);
  if (!ctx) throw new Error(`${component} must be used inside <Tabs> or <TabsProvider>`);
  return ctx;
}

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: React.ReactNode;
}

/**
 * Provides tab state to a tablist and any associated panels — including
 * panels that live in a visually separate region (e.g. a docked header).
 */
export function TabsProvider({
  value,
  onValueChange,
  children,
}: {
  value: string;
  onValueChange: (v: string) => void;
  children: React.ReactNode;
}) {
  const idPrefix = React.useId();
  const ctx = React.useMemo(
    () => ({ value, setValue: onValueChange, idPrefix }),
    [value, onValueChange, idPrefix],
  );
  return <TabsContext.Provider value={ctx}>{children}</TabsContext.Provider>;
}

/**
 * Roving-tabindex tab list following the WAI-ARIA tabs pattern with
 * arrow-key navigation, so it is fully keyboard operable.
 */
export function TabList({
  items,
  label,
  variant = 'pill',
  fill = true,
  className,
}: {
  items: TabItem[];
  label: string;
  variant?: 'pill' | 'underline';
  fill?: boolean;
  className?: string;
}) {
  const ctx = useTabs('TabList');
  const { value, setValue } = ctx;
  const listRef = React.useRef<HTMLDivElement>(null);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = items.findIndex((i) => i.id === value);
    if (idx < 0) return;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % items.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + items.length) % items.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setValue(items[next].id);
    listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${items[next].id}"]`)?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'relative inline-flex items-center gap-1',
        variant === 'pill' && 'rounded-xl border border-navy-200 bg-navy-100/70 p-1',
        variant === 'underline' && 'w-full justify-start gap-0 border-b border-navy-200',
        fill && variant === 'pill' && 'w-full',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.id === value;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            data-tab-id={item.id}
            type="button"
            role="tab"
            id={`${ctx.idPrefix}-tab-${item.id}`}
            aria-selected={active}
            aria-controls={`${ctx.idPrefix}-panel-${item.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => setValue(item.id)}
            className={cn(
              'relative inline-flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-semibold no-tap-highlight',
              'transition-colors duration-200 ease-calm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600 focus-visible:ring-offset-1',
              variant === 'underline' && 'flex-none rounded-none px-4 sm:px-5',
              active
                ? 'bg-white text-navy-900 shadow-xs ring-1 ring-navy-200/70'
                : 'text-navy-500 hover:text-navy-800',
              variant === 'underline' && active && 'bg-transparent shadow-none ring-0',
            )}
          >
            {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
            <span className="truncate">{item.label}</span>
            {item.badge}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Convenience wrapper: a `TabsProvider` around a `TabList` plus any panels
 * passed as children.
 */
export function Tabs({
  value,
  onValueChange,
  items,
  className,
  label,
  variant = 'pill',
  fill = true,
  children,
  panelClassName,
}: {
  value: string;
  onValueChange: (v: string) => void;
  items: TabItem[];
  className?: string;
  label: string;
  variant?: 'pill' | 'underline';
  fill?: boolean;
  children?: React.ReactNode;
  panelClassName?: string;
}) {
  return (
    <TabsProvider value={value} onValueChange={onValueChange}>
      <TabList
        items={items}
        label={label}
        variant={variant}
        fill={fill}
        className={className}
      />
      {children ? <div className={cn('mt-5', panelClassName)}>{children}</div> : null}
    </TabsProvider>
  );
}

export function TabPanel({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = useTabs('TabPanel');
  const active = ctx.value === value;
  return (
    <div
      role="tabpanel"
      id={`${ctx.idPrefix}-panel-${value}`}
      aria-labelledby={`${ctx.idPrefix}-tab-${value}`}
      hidden={!active}
      className={cn(active && 'animate-slide-up', className)}
      tabIndex={0}
    >
      {active ? children : null}
    </div>
  );
}

export type { Div };
