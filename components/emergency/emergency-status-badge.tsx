'use client';

import * as React from 'react';
import { Activity, Radio, ShieldCheck, TriangleAlert, WifiOff } from 'lucide-react';
import { SYSTEM_STATUS, type SystemMode } from '@/lib/types';
import { cn } from '@/lib/utils';

const MODES: Record<SystemMode, { label: string; icon: typeof Activity; chip: string; dot: string }> = {
  operational: {
    label: 'System Operational',
    icon: ShieldCheck,
    chip: 'bg-relief-50 text-relief-700 ring-relief-200',
    dot: 'bg-relief-500',
  },
  relief: {
    label: 'Live Relief Mode',
    icon: Radio,
    chip: 'bg-navy-900 text-white ring-navy-900',
    dot: 'bg-relief-400',
  },
  degraded: {
    label: 'Partial Outage',
    icon: TriangleAlert,
    chip: 'bg-alert-100 text-alert-800 ring-alert-300',
    dot: 'bg-alert-500',
  },
  offline: {
    label: 'Offline',
    icon: WifiOff,
    chip: 'bg-navy-100 text-navy-600 ring-navy-200',
    dot: 'bg-navy-400',
  },
} as const;

/**
 * System status badge. The live region announces state changes only, so
 * screen-reader users are not interrupted by a static status.
 */
export function EmergencyStatusBadge({
  mode = SYSTEM_STATUS.mode,
  className,
  showDetail = false,
  size = 'md',
}: {
  mode?: SystemMode;
  className?: string;
  showDetail?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const cfg = MODES[mode] ?? MODES.operational;
  const Icon = cfg.icon;

  return (
    <div
      className={cn(
        'group relative inline-flex items-center gap-2.5 rounded-full ring-1 ring-inset transition-colors duration-200',
        cfg.chip,
        size === 'sm' && 'px-2.5 py-1',
        size === 'md' && 'px-3 py-1.5',
        size === 'lg' && 'px-4 py-2',
        className,
      )}
    >
      <span className="relative flex size-2.5 shrink-0" aria-hidden="true">
        {mode === 'relief' && (
          <span
            className={cn('absolute inset-0 rounded-full animate-pulse-ring', cfg.dot)}
          />
        )}
        <span className={cn('relative size-2.5 rounded-full', cfg.dot)} />
      </span>

      <Icon
        className={cn(
          'shrink-0',
          size === 'sm' ? 'size-3.5' : size === 'lg' ? 'size-5' : 'size-4',
        )}
        aria-hidden="true"
      />

      <span
        className={cn(
          'font-bold leading-none tracking-tight whitespace-nowrap',
          size === 'sm' ? 'text-2xs' : size === 'lg' ? 'text-base' : 'text-xs',
        )}
      >
        {cfg.label}
      </span>

      {showDetail && (
        <span className="hidden text-2xs font-medium opacity-75 sm:inline">
          · {SYSTEM_STATUS.region}
        </span>
      )}

      <span role="status" aria-live="polite" className="sr-only">
        System status: {cfg.label}. {SYSTEM_STATUS.detail}
      </span>
    </div>
  );
}

export function statusConfig(mode: SystemMode) {
  return MODES[mode] ?? MODES.operational;
}
