'use client';

import * as React from 'react';
import { Slot } from './slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ *
 * Button
 * All variants keep text/background contrast at >= 4.5:1 and every
 * size has a >= 40px hit area (WCAG 2.2 target size guidance).
 * ------------------------------------------------------------------ */

const buttonVariants = cva(
  [
    'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap',
    'rounded-xl font-semibold no-tap-highlight',
    'transition-[background-color,color,box-shadow,transform,border-color] duration-200 ease-calm',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-55 disabled:saturate-50',
    'active:translate-y-px',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-navy-900 text-white shadow-soft hover:bg-navy-800 hover:shadow-card active:bg-navy-950',
        accent:
          'bg-emergency-500 text-white shadow-glow-rose hover:bg-emergency-600 active:bg-emergency-700',
        sos: 'bg-emergency-600 text-white shadow-glow-rose hover:bg-emergency-500 active:bg-emergency-700',
        alert:
          'bg-alert-500 text-white shadow-soft hover:bg-alert-600 active:bg-alert-700',
        outline:
          'border border-navy-300 bg-white text-navy-800 shadow-xs hover:border-navy-400 hover:bg-navy-50 hover:text-navy-900',
        outlineNavy:
          'border border-white/25 bg-white/5 text-white backdrop-blur hover:border-white/40 hover:bg-white/10',
        ghost: 'text-navy-700 hover:bg-navy-100 hover:text-navy-900',
        ghostLight: 'text-white/80 hover:bg-white/10 hover:text-white',
        subtle: 'bg-navy-100 text-navy-800 hover:bg-navy-200',
        link: 'text-dispatch-700 underline-offset-4 hover:underline',
        white:
          'bg-white text-navy-900 shadow-card hover:bg-navy-50 active:bg-navy-100',
      },
      size: {
        xs: 'h-8 rounded-lg px-2.5 text-xs [&_svg]:size-3.5',
        sm: 'h-10 rounded-lg px-3.5 text-sm [&_svg]:size-4',
        md: 'h-11 rounded-xl px-4 text-sm [&_svg]:size-4',
        lg: 'h-13 min-h-[52px] rounded-xl px-5 text-base [&_svg]:size-5',
        xl: 'h-14 min-h-[56px] rounded-2xl px-6 text-base [&_svg]:size-5',
        icon: 'size-11 rounded-xl [&_svg]:size-5',
        iconSm: 'size-9 rounded-lg [&_svg]:size-4',
        iconLg: 'size-13 min-h-[52px] rounded-xl [&_svg]:size-6',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  /** Screen-reader label when the button is icon-only. */
  srLabel?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    block,
    asChild = false,
    loading = false,
    disabled,
    children,
    srLabel,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-label={srLabel}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading</span>
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
});

export { buttonVariants };
