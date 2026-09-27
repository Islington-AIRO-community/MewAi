'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

/**
 * Page-level chrome and page states.
 *
 * Everything here draws a whole page region: the header band, the empty/error
 * card, the loading line, the inline advisory. Form controls live in
 * `inputs.tsx` and card sub-patterns in `card.tsx`, because a client component
 * importing from this module ships the whole module — the icons included.
 */

/* ================================================================== *
 * Page-level chrome
 * ================================================================== */

/**
 * The light header band every list route opens with.
 *
 * Four routes hand-rolled this byte-for-byte and a fifth was a near-clone with
 * the flex row removed, so the h1 size, the icon chip, the subtitle measure and
 * the vertical rhythm all existed in five slightly different versions. The
 * breakpoint for the action slot is `lg` here because the action is a button
 * row: below that it stacks under the title rather than competing with it.
 *
 * `children` renders *below* the title/action row, not beside the title. A
 * filter row wants the full container width; there is no caller that needs it
 * inside the left column.
 */
export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Status badges, filter rows, tabs — full width under the title row. */
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-navy-200 bg-white">
      <div className="container py-7 sm:py-9">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-navy-100 text-navy-700">
                <Icon className="size-4.5" aria-hidden="true" />
              </span>
              <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">
                {title}
              </h1>
            </div>
            {description ? (
              <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-navy-500">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-2.5">{actions}</div> : null}
        </div>
        {children ? <div className="mt-5">{children}</div> : null}
      </div>
    </div>
  );
}

/* ================================================================== *
 * Page states — empty, error, loading
 * ================================================================== */

/**
 * The centred "nothing here / something went wrong" card.
 *
 * This shape existed seven times across three paddings, two icon sizes and one
 * site that skipped `Card` entirely. `tone` carries the meaning so it is never
 * colour alone — `alert` is paired with a warning glyph, `quiet` with a neutral
 * one, `relief` with a tick, and the caller supplies the text.
 *
 * Two normalisations are deliberate. The padding below is the one the majority of
 * sites used; the others were `p-8` (tighter, 32px) and `px-6 py-14` (looser,
 * 56px) for what is the same component. And the icon chip is `size-12` everywhere
 * — the one success state on the dashboard had a 56px chip with a 28px glyph in
 * it, which is not a distinction anybody could name. Override with `className`
 * only when the surrounding page genuinely wants a different density, not to
 * reintroduce the drift.
 */
export function StateCard({
  icon: Icon,
  tone = 'quiet',
  title,
  children,
  action,
  className,
  titleAs: TitleTag = 'h2',
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'quiet' | 'alert' | 'relief';
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  titleAs?: 'h1' | 'h2' | 'h3';
}) {
  const chips = {
    quiet: 'bg-navy-100 text-navy-500 ring-navy-200',
    alert: 'bg-alert-50 text-alert-600 ring-alert-200',
    relief: 'bg-relief-50 text-relief-600 ring-relief-200',
  } as const;
  return (
    <Card className={cn('px-6 py-12 text-center', className)}>
      <span
        className={cn(
          'mx-auto grid size-12 place-items-center rounded-2xl ring-1 ring-inset',
          chips[tone],
        )}
        aria-hidden="true"
      >
        <Icon className="size-6" />
      </span>
      <TitleTag
        className={cn(
          'mt-4 font-bold tracking-tight text-navy-900',
          TitleTag === 'h1' ? 'text-xl' : 'text-base',
        )}
      >
        {title}
      </TitleTag>
      {children ? (
        /* A `<div>`, not a `<p>`: one site has two paragraphs and the second
           was hand-spaced to `mt-2`. */
        <div className="mx-auto mt-1.5 max-w-sm text-pretty text-sm leading-relaxed text-navy-500">
          {children}
        </div>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </Card>
  );
}

/**
 * The one loading treatment. Six sites had this paragraph and three different
 * vertical paddings, and the `/chat` server shell had a fourth spinner built
 * from scratch instead of using the icon.
 */
export function LoadingBlock({ label, className }: { label: string; className?: string }) {
  return (
    <p
      className={cn(
        'flex items-center justify-center gap-2 py-16 text-sm text-navy-500',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {label}
    </p>
  );
}

/* ================================================================== *
 * Notices
 * ================================================================== */

/**
 * An inline advisory. `tone="critical"` is `emergency`, which in this palette
 * means a human's life is at risk right now; `tone="caution"` is `alert` and
 * means attention without danger. The two must not look alike, so they never
 * share a class string.
 *
 * `role` is a prop rather than baked in because the five call sites genuinely
 * disagree: an error the reporter just caused wants `alert` (assertive), the
 * "the assistant is offline" note is context and would interrupt a screen
 * reader mid-sentence if it did. Pass `undefined` to match that.
 */
export function Notice({
  tone = 'caution',
  icon: Icon,
  children,
  className,
  role,
}: {
  tone?: 'caution' | 'critical' | 'info';
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
  role?: 'alert' | 'status';
}) {
  const styles = {
    caution: 'border-alert-200 bg-alert-50 text-alert-800',
    critical: 'border-emergency-200 bg-emergency-50 text-emergency-800',
    info: 'border-dispatch-200 bg-dispatch-50 text-dispatch-800',
  } as const;
  return (
    <div
      role={role}
      className={cn(
        'flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold leading-relaxed',
        styles[tone],
        className,
      )}
    >
      {Icon ? <Icon className="mt-px size-3.5 shrink-0" aria-hidden="true" /> : null}
      <p className="min-w-0">{children}</p>
    </div>
  );
}
