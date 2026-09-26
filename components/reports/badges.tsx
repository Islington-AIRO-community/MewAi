'use client';

import * as React from 'react';
import { AlertOctagon, AlertTriangle, ArrowDownRight, ArrowUpRight, Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PRIORITIES, type Priority, type SystemMode } from '@/lib/types';
import { statusConfig } from '@/components/emergency/emergency-status-badge';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ *
 * Priority badge — shape + label + colour (never colour alone)
 * ------------------------------------------------------------------ */

const PRIORITY_ICON: Record<Priority, typeof Circle> = {
  critical: AlertOctagon,
  high: AlertTriangle,
  medium: Circle,
  low: Circle,
};

export function PriorityBadge({
  priority,
  size = 'md',
  showSla = false,
  className,
}: {
  priority: Priority;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showSla?: boolean;
  className?: string;
}) {
  const meta = PRIORITIES[priority];
  const Icon = PRIORITY_ICON[priority];

  return (
    <Badge
      tone="outline"
      size={size}
      className={cn(meta.chip, 'ring-inset', className)}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" fill={priority === 'critical' ? 'currentColor' : 'none'} />
      {meta.label}
      {showSla && (
        <span className="font-normal opacity-80">
          · {meta.slaMinutes >= 1440 ? '24h' : `${meta.slaMinutes}m`}
        </span>
      )}
      <span className="sr-only"> priority</span>
    </Badge>
  );
}

/** Small coloured bar used on report cards and list rows. */
export function PriorityBar({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <span
      className={cn('block w-1 rounded-full', PRIORITIES[priority].bar, className)}
      aria-hidden="true"
    />
  );
}

/* ------------------------------------------------------------------ *
 * Status chip for report lifecycle
 * ------------------------------------------------------------------ */

const STAGE_CHIP: Record<string, { label: string; cls: string }> = {
  submitted: { label: 'Submitted', cls: 'bg-navy-100 text-navy-700 ring-navy-200' },
  triage: { label: 'Under review', cls: 'bg-alert-50 text-alert-800 ring-alert-200' },
  dispatched: { label: 'Dispatched', cls: 'bg-dispatch-50 text-dispatch-700 ring-dispatch-200' },
  'on-site': { label: 'On site', cls: 'bg-relief-50 text-relief-700 ring-relief-200' },
  resolved: { label: 'Resolved', cls: 'bg-navy-900 text-white ring-navy-900' },
};

export function StageChip({ stage, className }: { stage: string; className?: string }) {
  const cfg = STAGE_CHIP[stage] ?? STAGE_CHIP.submitted;
  return (
    <Badge tone="outline" size="sm" className={cn(cfg.cls, className)}>
      {cfg.label}
    </Badge>
  );
}

/* ------------------------------------------------------------------ *
 * Live indicator
 * ------------------------------------------------------------------ */

export function LiveDot({ className, label = 'Live' }: { className?: string; label?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="relative flex size-2" aria-hidden="true">
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-current opacity-60" />
        <span className="relative size-2 rounded-full bg-current" />
      </span>
      <span className="text-2xs font-bold uppercase tracking-[0.1em]">{label}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Delta indicator for stat cards
 * ------------------------------------------------------------------ */

export function DeltaChip({
  value,
  label,
  invert = false,
  className,
}: {
  value: number;
  label?: string;
  /** When true, a *decrease* is the good outcome (e.g. queue length). */
  invert?: boolean;
  className?: string;
}) {
  const up = value >= 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;

  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-bold', className)}>
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 ring-1 ring-inset',
          good ? 'bg-relief-50 text-relief-700 ring-relief-200' : 'bg-alert-50 text-alert-800 ring-alert-200',
        )}
      >
        <Icon className="size-3" aria-hidden="true" />
        <span className="nums">{Math.abs(value).toFixed(1)}%</span>
      </span>
      {label && <span className="font-medium text-navy-400">{label}</span>}
      <span className="sr-only">{up ? 'increase' : 'decrease'}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * System status dot for department cards
 * ------------------------------------------------------------------ */

export function StatusPill({ mode, className }: { mode: SystemMode; className?: string }) {
  const cfg = statusConfig(mode);
  return (
    <Badge tone="outline" size="sm" className={cn(cfg.chip, className)}>
      {cfg.label}
    </Badge>
  );
}
