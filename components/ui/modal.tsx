'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

const SIZES = {
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[min(56rem,100%)]',
} as const;

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof SIZES;
  tone?: 'default' | 'critical';
  /** Hide the header close button for flow-critical confirmations. */
  hideClose?: boolean;
}

/**
 * Accessible modal: focus trap, Escape to close, scroll lock, and a labelled
 * dialog role. Announced politely so screen-reader users get context.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  tone = 'default',
  hideClose = false,
}: ModalProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const restoreRef = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();
  const descId = React.useId();

  // Remember the trigger to restore focus on close.
  React.useEffect(() => {
    if (open) {
      restoreRef.current = document.activeElement as HTMLElement;
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
        restoreRef.current?.focus?.();
      };
    }
  }, [open]);

  // Move focus into the dialog and trap Tab.
  React.useEffect(() => {
    if (!open) return;
    const node = panelRef.current;
    if (!node) return;

    const focusables = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    const first = focusables()[0];
    (first ?? node).focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !hideClose) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose, hideClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-navy-950/70 backdrop-blur-[3px]"
            onClick={hideClose ? undefined : onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, y: 24, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.99 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'relative flex max-h-[92dvh] w-full flex-col overflow-hidden bg-white shadow-lift outline-none',
              'rounded-t-3xl sm:rounded-3xl',
              SIZES[size],
            )}
          >
            <div
              className={cn(
                'flex items-start gap-4 border-b px-5 py-4 sm:px-6 sm:py-5',
                tone === 'critical'
                  ? 'border-emergency-200 bg-emergency-50'
                  : 'border-navy-100 bg-white',
              )}
            >
              <div className="min-w-0 flex-1">
                <h2
                  id={titleId}
                  className={cn(
                    'text-lg font-bold leading-snug tracking-tight',
                    tone === 'critical' ? 'text-emergency-800' : 'text-navy-900',
                  )}
                >
                  {title}
                </h2>
                {description && (
                  <p
                    id={descId}
                    className={cn(
                      'mt-1 text-sm leading-relaxed',
                      tone === 'critical' ? 'text-emergency-700' : 'text-navy-500',
                    )}
                  >
                    {description}
                  </p>
                )}
              </div>
              {!hideClose && (
                <Button
                  variant="ghost"
                  size="iconSm"
                  onClick={onClose}
                  srLabel="Close dialog"
                  className="-mr-1.5 -mt-1 shrink-0 text-navy-500"
                >
                  <X aria-hidden="true" />
                </Button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
              {children}
            </div>

            {footer && (
              <div className="safe-bottom border-t border-navy-100 bg-navy-50/60 px-5 py-4 sm:px-6">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
