'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { STAT_TONES, type DashboardStat } from '@/lib/types';
import { cn, formatNumber } from '@/lib/utils';
import { useCountUp, usePrefersReducedMotion } from '@/lib/hooks';
import { DeltaChip } from './badges';

/** Compact SVG sparkline — no chart library, no network payload. */
function Sparkline({
  data,
  className,
  fillClass,
  strokeClass,
  dotClass,
}: {
  data: number[];
  className?: string;
  fillClass: string;
  strokeClass: string;
  dotClass: string;
}) {
  const w = 96;
  const h = 28;
  const pad = 3;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });

  const line = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
  const area = `${line} L${w - pad} ${h} L${pad} ${h} Z`;
  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn('h-7 w-24', className)}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="none"
    >
      <path d={area} className={fillClass} stroke="none" />
      <path
        d={line}
        className={strokeClass}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={last[0]}
        cy={last[1]}
        r="2.5"
        className={dotClass}
        stroke="white"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function StatCard({
  stat,
  className,
  index = 0,
}: {
  stat: DashboardStat;
  className?: string;
  index?: number;
}) {
  const tone = STAT_TONES[stat.tone];
  const animated = useCountUp(stat.value);
  const reduced = usePrefersReducedMotion();
  const Icon = stat.icon;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn('grid size-9 shrink-0 place-items-center rounded-xl ring-1 ring-inset', tone.chip)}
          >
            <Icon className="size-4.5" aria-hidden="true" />
          </span>
          <p className="truncate text-xs font-bold uppercase tracking-[0.06em] text-navy-500">
            {stat.label}
          </p>
        </div>
        <Sparkline
          data={stat.spark}
          fillClass={tone.spark.split(' ')[0]}
          strokeClass={tone.spark.split(' ')[1]}
          dotClass={tone.bar}
          className="hidden shrink-0 sm:block"
        />
      </div>

      <p className="mt-3 flex items-baseline gap-2">
        <motion.span
          className={cn('nums text-3xl font-extrabold leading-none tracking-tight sm:text-4xl', tone.text)}
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: reduced ? 0 : index * 0.06 }}
        >
          {formatNumber(animated)}
        </motion.span>
        <DeltaChip
          value={stat.delta}
          label={stat.deltaLabel}
          invert={stat.id === 'review'}
        />
      </p>
    </>
  );

  const shell = cn(
    'group relative overflow-hidden rounded-2xl border border-navy-200/80 bg-white p-4 shadow-soft',
    'transition-shadow duration-300 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600 focus-visible:ring-offset-2 sm:p-5',
    className,
  );

  if (stat.href) {
    return (
      <Link href={stat.href} className={cn(shell, 'block')}>
        <span className="absolute inset-0" aria-hidden="true" />
        {body}
        <span className="sr-only">View {stat.label.toLowerCase()}</span>
      </Link>
    );
  }

  return <div className={shell}>{body}</div>;
}

/**
 * Compact stat used in narrow rails. Label-first, value-second, so the
 * meaning survives truncation on small screens.
 */
export function MiniStat({
  label,
  value,
  hint,
  tone = 'navy',
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: keyof typeof STAT_TONES;
  className?: string;
}) {
  const t = STAT_TONES[tone];
  return (
    <div
      className={cn(
        'rounded-xl border border-navy-200/80 bg-white p-3 shadow-xs',
        className,
      )}
    >
      <p className="flex items-center gap-1.5 truncate text-2xs font-bold uppercase tracking-[0.06em] text-navy-400">
        <span className={cn('size-1.5 shrink-0 rounded-full', t.bar)} aria-hidden="true" />
        {label}
      </p>
      <p className={cn('nums mt-1 text-xl font-extrabold leading-none', t.text)}>{value}</p>
      {hint && <p className="mt-1 truncate text-2xs text-navy-400">{hint}</p>}
    </div>
  );
}
