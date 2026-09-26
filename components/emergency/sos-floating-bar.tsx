'use client';

import * as React from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquareText, PhoneCall } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { usePrefersReducedMotion } from '@/lib/hooks';

/**
 * Persistent bottom-right quick-access bar.
 *
 * - One large SOS target (52px, thumb reachable, never more than a thumb away).
 * - The assistant orb is docked immediately above this bar by the shell, so help
 *   is never more than one tap away without two competing buttons side by side.
 * - On mobile the dock gives way to a full-width strip above the tab bar.
 *   Respects safe-area insets.
 */
export function SosFloatingBar({
  onOpenSos,
  className,
  unreadCount = 0,
}: {
  onOpenSos: () => void;
  className?: string;
  unreadCount?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const [mounted, setMounted] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      {/* Compact dock: the SOS control. Always visible, always reachable. */}
      <AnimatePresence>
        {mounted && (
          <motion.div
            data-sos-bar=""
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              // Below `sm` the docked action strip takes over, so avoid doubling up.
              'fixed bottom-0 right-0 z-[60] hidden flex-col items-end gap-2.5 sm:flex no-print',
              'safe-bottom px-4 pb-4 transition-shadow duration-300',
              // Lift the dock off the page once content scrolls underneath it.
              scrolled && 'drop-shadow-[0_10px_24px_rgba(15,23,42,0.14)]',
              className,
            )}
          >
            {/* Only the SOS control lives here; the assistant orb is docked
                directly above by the shell so the two never compete. */}
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <span
                  className="absolute inset-0 -z-10 animate-pulse-ring rounded-2xl bg-emergency-500/50"
                  aria-hidden="true"
                />
                <Button
                  variant="sos"
                  size="iconLg"
                  onClick={onOpenSos}
                  srLabel="Emergency SOS — alert the nearest crew with your live location"
                  className="stripe-critical"
                >
                  <PhoneCall aria-hidden="true" />
                </Button>
                <span
                  className="pointer-events-none absolute -right-1 -top-1 grid min-w-[22px] place-items-center rounded-full bg-white px-1.5 text-2xs font-black text-emergency-600 ring-2 ring-emergency-500"
                  aria-hidden="true"
                >
                  SOS
                </span>
              </div>
            </div>

            {/* Persistent label strip — clarifies the crimson block for everyone. */}
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <span className="rounded-full bg-navy-900 px-2.5 py-1 text-2xs font-bold text-white shadow-soft">
                  {unreadCount} update{unreadCount === 1 ? '' : 's'}
                </span>
              )}
              <span className="rounded-full bg-white/95 px-2.5 py-1 text-2xs font-bold uppercase tracking-[0.1em] text-emergency-700 shadow-soft ring-1 ring-emergency-200 backdrop-blur">
                Emergency SOS
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile action strip: sits directly on top of the tab bar, sharing its
          `--tabbar-h` token so the two can never collide. */}
      <div
        data-sos-bar=""
        className="no-print fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+var(--tabbar-h))] border-t border-emergency-200 bg-emergency-50/95 backdrop-blur-lg sm:hidden"
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <Button
            variant="sos"
            size="lg"
            block
            onClick={onOpenSos}
            className="stripe-critical"
          >
            <PhoneCall aria-hidden="true" />
            Emergency SOS
          </Button>
          <Button asChild variant="outline" size="lg" className="shrink-0">
            <Link href="/chat" aria-label="Open AI Relief Assistant">
              <MessageSquareText aria-hidden="true" />
              <span className="sr-only">Ask AI</span>
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}
