'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type Div = React.HTMLAttributes<HTMLDivElement>;

/** Thin, high-contrast separator used to separate dense data rows. */
export function Separator({ className, ...props }: Div) {
  return (
    <div
      role="separator"
      className={cn('h-px w-full shrink-0 bg-navy-100', className)}
      {...props}
    />
  );
}

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
        'inline-flex h-6 min-w-[24px] items-center justify-center rounded-md border border-navy-200 bg-navy-50 px-1.5',
        'font-mono text-2xs font-semibold text-navy-500 shadow-[0_1px_0_0_rgb(15_23_42/0.06)]',
        className,
      )}
      {...props}
    />
  );
}

/** Screen-reader-only helper for form controls. */
export function FieldHint({
  id,
  children,
  className,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p id={id} className={cn('text-xs leading-relaxed text-navy-500', className)}>
      {children}
    </p>
  );
}
