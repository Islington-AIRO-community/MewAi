'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/primitives';

/**
 * Form controls.
 *
 * Split out of `patterns.tsx` deliberately. Both modules are imported by client
 * components, so keeping them together meant every route paid for the icons of
 * the controls it did not use — roughly a kilobyte on `/reports`, which renders
 * no spinner and no search-adjacent icon of its own. Bundling by concern is
 * what lets a route import exactly what it draws.
 */

/* ================================================================== *
 * Controls
 * ================================================================== */

/**
 * A mutually-exclusive filter toggle.
 *
 * Two incompatible `FilterChip`s existed under this name — the `/reports` one
 * had a min-height and a focus ring, the `/admin` one had neither and was ~22px
 * tall. Both sat well under the 44px target this product holds itself to, so
 * the floor here is 32px of chip plus padding from the call site, and the focus
 * ring is not optional.
 *
 * `activeClassName` exists for one caller: the `/reports` priority filter has to
 * stay on the priority ramp (`p.chip`), because a chip that says "critical" and
 * is coloured like "low" is worse than no colour at all. Everything else uses
 * the navy default.
 */
export function FilterChip({
  active,
  children,
  className,
  activeClassName,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  activeClassName?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'min-h-[32px] rounded-full px-2.5 text-xs font-bold capitalize no-tap-highlight',
        'ring-1 ring-inset transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600 focus-visible:ring-offset-2',
        active
          ? activeClassName ?? 'bg-navy-900 text-white ring-navy-900'
          : 'bg-white text-navy-500 ring-navy-200 hover:bg-navy-50',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * The house text input.
 *
 * Four idioms were in use: two of them differed only in radius, one used `focus:`
 * instead of `focus-visible:` (so it lit up on click), and one sat at `text-sm`
 * = 14px, which breaks the >=16px rule that stops iOS zooming on focus. All four
 * also repeated a 110-character class string. The floor here is 16px and
 * `focus-visible:`, and the error state is an `aria-invalid` the caller owns.
 */
export function TextField({
  label,
  error,
  hint,
  className,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-error` : undefined;
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={errId ?? hintId}
        className={cn(
          'mt-1.5 h-11 w-full rounded-lg border bg-white px-3 text-base text-navy-900',
          'placeholder:text-navy-300 disabled:bg-navy-50 disabled:text-navy-400',
          'focus-visible:outline-none focus-visible:ring-2',
          error
            ? 'border-emergency-400 focus-visible:ring-emergency-500/40'
            : 'border-navy-200 focus-visible:border-dispatch-500 focus-visible:ring-dispatch-600/30',
        )}
        {...props}
      />
      {error ? (
        <p id={errId} className="mt-1.5 text-xs font-semibold text-emergency-700">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-xs leading-relaxed text-navy-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The icon-prefixed search input.
 *
 * Separate from `TextField` because the leading glyph needs `pl-9` and the two
 * call sites also want a trailing clear button, which `TextField` has no slot
 * for. It exists mostly to fix a bug: both sites were at `text-sm` = 14px, and
 * a sub-16px input makes iOS zoom the viewport on focus — which for the
 * `/reports` filter means the search box jumps out from under the finger
 * mid-query.
 *
 * The label is for screen readers only; the glyph is the visible affordance, so
 * a sighted keyboard user still gets the global focus ring on the input itself.
 *
 * Forwarded ref, not optional decoration: the chat transcript focuses this
 * programmatically when the search bar opens, and a wrapper that swallowed the
 * ref would make that impossible to write.
 */
export const SearchField = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { inputClassName?: string }
>(function SearchField({ className, inputClassName, ...props }, ref) {
  return (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-navy-400"
        aria-hidden="true"
      />
      <input
        ref={ref}
        type="search"
        aria-label={props['aria-label'] ?? props.placeholder}
        className={cn(
          'h-11 w-full rounded-lg border border-navy-200 bg-white pl-9 text-base text-navy-900',
          'placeholder:text-navy-400',
          'focus-visible:border-dispatch-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600/30',
          inputClassName,
        )}
        {...props}
      />
    </div>
  );
});

