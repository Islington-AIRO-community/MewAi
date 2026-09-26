'use client';

import * as React from 'react';
import { Activity, HeartPulse, ShieldPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The FLARE mark: a shield containing a pulse line — protection + care.
 * Rendered as inline SVG so it is crisp, themable and free of network cost.
 */
export function Logo({ className, tone = 'navy' }: { className?: string; tone?: 'navy' | 'light' }) {
  const isLight = tone === 'light';
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'relative grid size-9 shrink-0 place-items-center rounded-xl shadow-sm',
          isLight ? 'bg-white/10 ring-1 ring-white/25' : 'bg-navy-900',
        )}
      >
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" fill="none">
          <path
            d="M12 2.6 4.6 5.4v6.1c0 4.6 3.1 8.7 7.4 9.9 4.3-1.2 7.4-5.3 7.4-9.9V5.4L12 2.6Z"
            className={isLight ? 'fill-white' : 'fill-white'}
            opacity={0.14}
          />
          <path
            d="M12 2.6 4.6 5.4v6.1c0 4.6 3.1 8.7 7.4 9.9 4.3-1.2 7.4-5.3 7.4-9.9V5.4L12 2.6Z"
            stroke={isLight ? '#fff' : '#fff'}
            strokeWidth="1.6"
            strokeLinejoin="round"
            className="opacity-90"
          />
          <path
            d="M6.9 12.2h2.3l1.3-2.6 1.7 4.3 1.2-2.1h3"
            stroke={isLight ? '#FCA5B5' : '#FDA4AF'}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <span className="flex flex-col leading-none">
        <span
          className={cn(
            'text-[17px] font-extrabold tracking-[-0.02em]',
            isLight ? 'text-white' : 'text-navy-900',
          )}
        >
          FLARE
        </span>
        <span
          className={cn(
            'mt-0.5 text-[9px] font-semibold uppercase tracking-[0.16em]',
            isLight ? 'text-white/55' : 'text-navy-400',
          )}
        >
          Relief Network
        </span>
      </span>
    </span>
  );
}

export function LogoGlyphs() {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-2xs font-semibold uppercase tracking-[0.1em] text-navy-400">
      {[
        { icon: ShieldPlus, label: 'Verified responders' },
        { icon: Activity, label: 'Live dispatch network' },
        { icon: HeartPulse, label: 'AI triage, human care' },
      ].map(({ icon: Icon, label }) => (
        <li key={label} className="flex items-center gap-1.5">
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </li>
      ))}
    </ul>
  );
}
