'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Check, CircleDashed, Clock3 } from 'lucide-react';
import { STAGES, STAGE_IDS, type Report, type StageId } from '@/lib/types';
import { cn, shortStamp } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/lib/hooks';

function stageIndex(stage: StageId): number {
  return STAGE_IDS.indexOf(stage);
}

interface StepperProps {
  currentStage: StageId;
  stageTimestamps?: Partial<Record<StageId, string>>;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Show timestamps and description beneath each step. */
  detailed?: boolean;
}

/**
 * Report lifecycle stepper.
 *
 * Semantics: an ordered list (`<ol>`) so the sequence is conveyed even if
 * the connecting line is not perceived. Each step exposes its state via text
 * ("Completed", "In progress", "Not started") — not colour alone.
 */
export function ProgressStepper({
  currentStage,
  stageTimestamps,
  size = 'md',
  className,
  detailed = false,
}: StepperProps) {
  const current = stageIndex(currentStage);
  const reduced = usePrefersReducedMotion();

  const box = size === 'lg' ? 'size-11' : size === 'sm' ? 'size-7' : 'size-9';
  const iconSize = size === 'lg' ? 'size-5' : size === 'sm' ? 'size-3.5' : 'size-4';
  const text = size === 'lg' ? 'text-sm' : size === 'sm' ? 'text-2xs' : 'text-xs';

  return (
    <ol
      className={cn('w-full', className)}
      aria-label="Report progress"
    >
      {STAGES.map((stage, i) => {
        const done = i < current;
        const active = i === current;
        const pending = i > current;
        const stamp = stageTimestamps?.[stage.id];
        const Icon = stage.icon;
        const stateLabel = done ? 'Completed' : active ? 'In progress' : 'Not started';

        return (
          <li key={stage.id} className="relative flex gap-3 pb-5 last:pb-0 sm:gap-4">
            {/* Connector */}
            {i < STAGES.length - 1 && (
              <span
                className="absolute left-[calc(var(--box)/2-1px)] top-[calc(var(--box)+4px)] h-[calc(100%-var(--box)-1.25rem)] w-0.5 -translate-x-1/2 overflow-hidden rounded-full bg-navy-200 sm:left-[calc(var(--box)/2-1px)]"
                style={{ ['--box' as string]: size === 'lg' ? '2.75rem' : size === 'sm' ? '1.75rem' : '2.25rem' }}
                aria-hidden="true"
              >
                <motion.span
                  className="absolute inset-x-0 top-0 block rounded-full bg-relief-500"
                  initial={{ height: reduced ? (done ? '100%' : '0%') : '0%' }}
                  animate={{ height: done ? '100%' : '0%' }}
                  transition={{ duration: reduced ? 0 : 0.7, delay: reduced ? 0 : i * 0.08, ease: 'easeOut' }}
                />
              </span>
            )}

            {/* Node */}
            <span
              className="relative z-10 shrink-0"
              style={{ ['--box' as string]: size === 'lg' ? '2.75rem' : size === 'sm' ? '1.75rem' : '2.25rem' }}
            >
              <motion.span
                className={cn(
                  'grid place-items-center rounded-full ring-2 transition-colors duration-300',
                  box,
                  done && 'bg-relief-500 text-white ring-relief-200',
                  active && 'bg-navy-900 text-white ring-navy-200',
                  pending && 'bg-white text-navy-300 ring-navy-200',
                )}
                initial={false}
                animate={active && !reduced ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                transition={{ duration: 2.4, repeat: active ? Infinity : 0, ease: 'easeInOut' }}
              >
                {done ? (
                  <Check className={iconSize} strokeWidth={3} aria-hidden="true" />
                ) : active ? (
                  <span className="relative flex size-full items-center justify-center">
                    {active && !reduced && (
                      <span className="absolute inset-0 animate-pulse-ring rounded-full bg-navy-900/30" />
                    )}
                    <Icon className={cn(iconSize, 'relative')} aria-hidden="true" />
                  </span>
                ) : (
                  <CircleDashed className={iconSize} aria-hidden="true" />
                )}
              </motion.span>
            </span>

            {/* Content */}
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <p
                  className={cn(
                    'font-bold leading-snug',
                    text,
                    pending ? 'text-navy-400' : 'text-navy-900',
                    size === 'lg' && 'text-base',
                  )}
                >
                  {stage.label}
                </p>
                {active && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-navy-900 px-2 py-0.5 text-2xs font-bold uppercase tracking-[0.08em] text-white">
                    <span className="relative flex size-1.5">
                      <span className="absolute inset-0 animate-pulse-ring rounded-full bg-white/70" />
                      <span className="relative size-1.5 rounded-full bg-white" />
                    </span>
                    Now
                  </span>
                )}
                {stamp && (
                  <span className="nums inline-flex items-center gap-1 text-2xs font-semibold text-navy-400">
                    <Clock3 className="size-3" aria-hidden="true" />
                    {shortStamp(stamp)}
                  </span>
                )}
              </div>

              {detailed && (
                <p className={cn('mt-0.5 text-xs leading-relaxed', pending ? 'text-navy-300' : 'text-navy-500')}>
                  {stage.description}
                </p>
              )}

              <span className="sr-only">
                Step {i + 1} of {STAGES.length}: {stateLabel}.
                {stamp ? ` Completed at ${shortStamp(stamp)}.` : ''}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ *
 * Compact horizontal variant for cards & list rows
 * ------------------------------------------------------------------ */

export function StepperBar({ report, className }: { report: Report; className?: string }) {
  const current = stageIndex(report.currentStage);
  const reduced = usePrefersReducedMotion();
  const pct = ((current + 1) / STAGES.length) * 100;

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center gap-3">
        <div
          className="relative h-2 flex-1 overflow-hidden rounded-full bg-navy-100"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={STAGES.length}
          aria-valuenow={current + 1}
          aria-valuetext={`${STAGES[current].label}, step ${current + 1} of ${STAGES.length}`}
          aria-label="Report progress"
        >
          <motion.span
            className={cn(
              'absolute inset-y-0 left-0 rounded-full',
              report.currentStage === 'resolved' ? 'bg-relief-500' : 'bg-navy-800',
            )}
            initial={{ width: reduced ? `${pct}%` : 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: reduced ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        <span className="nums shrink-0 text-2xs font-bold text-navy-500">
          {current + 1}/{STAGES.length}
        </span>
      </div>

      {/* Micro stage labels — text equivalents of the dots. */}
      <ol className="mt-2 flex items-center justify-between gap-1">
        {STAGES.map((stage, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li
              key={stage.id}
              className={cn(
                'min-w-0 flex-1 truncate text-center text-[9px] font-bold uppercase leading-tight tracking-[0.04em]',
                done && 'text-navy-500',
                active && 'text-navy-900',
                i > current && 'text-navy-300',
              )}
              aria-hidden="true"
            >
              {stage.short}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
