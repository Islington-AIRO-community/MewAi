'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The house small-caps label. This is the single source for that look.
 *
 * It used to be one component called `Label` rendering a `<label>` element, and
 * 45 call sites hand-typed the same class string across seven different
 * tracking values. Worse, most of those sites are not form fields at all — they
 * are section titles, card headers and legend rows — so a `<label>` with no
 * control was standing in for a heading, and `reports/[id]`'s entire sidebar
 * ended up with no `<h2>` in it.
 *
 * So the two jobs are split. `Eyebrow` is the visual label and renders a
 * `<p>`; use `as="h2"` (or `h3`) when it titles a section. `Label` below is
 * reserved for real form fields.
 */
export function Eyebrow({
  as: Tag = 'p',
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> & {
  as?: 'p' | 'span' | 'div' | 'dt' | 'legend' | 'h2' | 'h3' | 'h4';
}) {
  return (
    <Tag
      className={cn(
        'text-2xs font-bold uppercase tracking-[0.08em] text-navy-400',
        className,
      )}
      {...props}
    />
  );
}

/** A real form label. Visual weight matches `Eyebrow`; semantics do not. */
export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        'text-2xs font-bold uppercase tracking-[0.08em] text-navy-400',
        className,
      )}
      {...props}
    />
  );
}

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-navy-200 bg-white px-1',
        'font-mono text-2xs font-semibold text-navy-500',
        className,
      )}
      {...props}
    />
  );
}
