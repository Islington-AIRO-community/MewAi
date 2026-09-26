'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, LayoutDashboard, LifeBuoy, MessageSquareText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/lib/store';
import { AppProvider } from '@/lib/store';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { SiteHeader } from './site-header';
import { SosFloatingBar } from '@/components/emergency/sos-floating-bar';
import { SosDialog } from '@/components/emergency/sos-dialog';
import { ReliefAssistant } from '@/components/assistant/relief-assistant';
import { reportCodeFromId } from '@/lib/utils';

const MOBILE_NAV = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/chat', label: 'Assistant', icon: MessageSquareText },
  { href: '/resources', label: 'Help', icon: LifeBuoy },
];

/**
 * App shell: providers, skip link, header, content, mobile nav, assistant
 * launcher, SOS bar, and the SOS dialog that any surface can open.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <ToastProvider>
        <Shell>{children}</Shell>
      </ToastProvider>
    </AppProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const [sosOpen, setSosOpen] = React.useState(false);
  const { reports, actionCards } = useApp();
  const { toast } = useToast();
  const pathname = usePathname();

  const pendingCards = actionCards.filter((c) => c.status === 'pending').length;
  const activeCount = reports.filter((r) => r.currentStage !== 'resolved').length;

  // Tell the user when the assistant captures something new, anywhere in the app.
  React.useEffect(() => {
    if (pendingCards === 0) return;
    toast({
      tone: 'info',
      title: 'Information captured',
      description: 'The assistant extracted a request and prepared it for dispatch.',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCards]);

  const onSosDispatched = React.useCallback(
    (reportId: string) => {
      toast({
        tone: 'critical',
        title: 'Emergency alert sent',
        description: `${reportCodeFromId(reportId)} created. Nearest units are en route.`,
      });
    },
    [toast],
  );

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <SiteHeader onOpenSos={() => setSosOpen(true)} />

      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>

      <SiteFooter onOpenSos={() => setSosOpen(true)} />

      {/* Persistent quick access.
          The assistant dock sits directly above the SOS bar (≈6.5rem tall on
          desktop) so the two never overlap. */}
      <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+7rem)] right-4 z-[61] hidden flex-col items-end sm:flex">
        <ReliefAssistant variant="floating" />
      </div>

      <SosFloatingBar onOpenSos={() => setSosOpen(true)} unreadCount={activeCount} />

      <MobileTabBar pathname={pathname} />

      <SosDialog
        open={sosOpen}
        onClose={() => setSosOpen(false)}
        onDispatched={onSosDispatched}
      />
    </div>
  );
}

function MobileTabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Primary mobile"
      className="no-print fixed inset-x-0 bottom-0 z-[55] min-h-[var(--tabbar-h)] border-t border-navy-200 bg-white/95 backdrop-blur-xl sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-4">
        {MOBILE_NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 no-tap-highlight',
                  'transition-colors duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-dispatch-600',
                  active ? 'text-navy-900' : 'text-navy-400',
                )}
              >
                <span
                  className={cn(
                    'grid h-7 w-12 place-items-center rounded-full transition-colors duration-200',
                    active && 'bg-navy-100',
                  )}
                >
                  <item.icon className="size-4.5" aria-hidden="true" />
                </span>
                <span className="text-[10px] font-bold tracking-tight">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SiteFooter({ onOpenSos }: { onOpenSos: () => void }) {
  return (
    <footer className="no-print mt-16 border-t border-navy-200 bg-white pb-[calc(env(safe-area-inset-bottom)+var(--tabbar-h)+var(--sos-strip-h)+0.75rem)] sm:pb-10">
      <div className="container py-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:justify-between">
          <div className="max-w-sm">
            <p className="text-sm font-bold text-navy-900">FLARE Relief Network</p>
            <p className="mt-1.5 text-sm leading-relaxed text-navy-500">
              A coordination layer for post-disaster response. FLARE routes requests to verified
              response teams and keeps people informed until help arrives.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <FooterCol
              title="Get help"
              links={[
                { label: 'Emergency SOS', action: onOpenSos },
                { label: 'Report an incident', href: '/chat' },
                { label: 'Find a shelter', href: '/resources' },
                { label: 'Voice assistant', href: '/chat' },
              ]}
            />
            <FooterCol
              title="My account"
              links={[
                { label: 'Dashboard', href: '/dashboard' },
                { label: 'My reports', href: '/reports' },
                { label: 'Sign in', href: '/login' },
              ]}
            />
            <FooterCol
              title="Assurance"
              links={[
                { label: 'How triage works', href: '/resources' },
                { label: 'Accessibility', href: '/resources' },
                { label: 'Responder verification', href: '/resources' },
              ]}
            />
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-navy-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-navy-400">
            If someone&rsquo;s life is in immediate danger, call your local emergency number first.
          </p>
          <p className="text-xs text-navy-400">
            &copy; {new Date().getFullYear()} FLARE Relief Network. Demo interface.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { label: string; href?: string; action?: () => void }[];
}) {
  return (
    <div>
      <p className="text-2xs font-bold uppercase tracking-[0.1em] text-navy-400">{title}</p>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.label}>
            {l.action ? (
              <button
                type="button"
                onClick={l.action}
                className="inline-block rounded py-1 text-left text-sm font-semibold text-emergency-700 hover:text-emergency-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600 focus-visible:ring-offset-2"
              >
                {l.label}
              </button>
            ) : (
              <Link
                href={l.href ?? '#'}
                className="inline-block rounded py-1 text-sm font-semibold text-navy-600 hover:text-dispatch-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600 focus-visible:ring-offset-2"
              >
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
