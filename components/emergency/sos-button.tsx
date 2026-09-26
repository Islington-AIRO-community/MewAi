'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'size-10 rounded-xl',
  md: 'size-12 rounded-2xl',
  lg: 'size-14 rounded-2xl',
} as const;

/**
 * The SOS control. Uses a restrained two-part language: a solid crimson
 * block (unambiguous) plus the word "SOS" and a phone glyph (redundant for
 * colour-blind and low-vision users). Never relies on colour alone.
 */
export function SosButton({
  onClick,
  className,
  size = 'md',
  srLabel = 'Activate SOS distress alert',
  pulsing = true,
}: {
  onClick: () => void;
  className?: string;
  size?: keyof typeof SIZES;
  srLabel?: string;
  pulsing?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={srLabel}
      className={cn(
        'group relative grid shrink-0 place-items-center overflow-hidden bg-emergency-600 font-black text-white no-tap-highlight',
        'shadow-glow-rose transition-transform duration-150 ease-calm active:scale-95',
        'hover:bg-emergency-500',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-emergency-600',
        SIZES[size],
        className,
      )}
    >
      {pulsing && (
        <span
          className="absolute inset-0 animate-pulse-ring rounded-[inherit] bg-white/30"
          aria-hidden="true"
        />
      )}
      <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
        <path
          d="M6.6 10.8a15 15 0 0 1 10.8 0M3.8 7.4a19 19 0 0 1 16.4 0M12 18.5h.01"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
      </svg>
      <span className="sr-only">{srLabel}</span>
    </button>
  );
}
