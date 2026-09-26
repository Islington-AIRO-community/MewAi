import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  [
    'inline-flex items-center gap-1.5 rounded-full font-semibold',
    'ring-1 ring-inset whitespace-nowrap',
    'transition-colors duration-200',
  ],
  {
    variants: {
      tone: {
        navy: 'bg-navy-100 text-navy-700 ring-navy-200',
        solid: 'bg-navy-900 text-white ring-navy-900',
        emergency: 'bg-emergency-50 text-emergency-700 ring-emergency-200',
        emergencySolid: 'bg-emergency-500 text-white ring-emergency-600',
        alert: 'bg-alert-50 text-alert-800 ring-alert-200',
        alertSolid: 'bg-alert-500 text-white ring-alert-600',
        dispatch: 'bg-dispatch-50 text-dispatch-700 ring-dispatch-200',
        relief: 'bg-relief-50 text-relief-700 ring-relief-200',
        reliefSolid: 'bg-relief-600 text-white ring-relief-700',
        glass: 'border border-white/25 bg-white/10 text-white ring-white/20 backdrop-blur',
        outline: 'bg-white text-navy-700 ring-navy-200',
        quiet: 'bg-transparent text-navy-500 ring-navy-200',
      },
      size: {
        xs: 'px-1.5 py-0.5 text-2xs [&_svg]:size-3',
        sm: 'px-2 py-0.5 text-2xs [&_svg]:size-3',
        md: 'px-2.5 py-1 text-xs [&_svg]:size-3.5',
        lg: 'px-3 py-1.5 text-sm [&_svg]:size-4',
      },
    },
    defaultVariants: { tone: 'navy', size: 'md' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}

export { badgeVariants };
