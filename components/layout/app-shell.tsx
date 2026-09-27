'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, LayoutDashboard, LifeBuoy, MessageSquareText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/lib/store';
import { AppProvider } from '@/lib/store';
import { AiChatProvider, useAiChatInstance } from '@/lib/ai-chat-context';
import { SessionProvider } from 'next-auth/react';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { Eyebrow } from '@/components/ui/primitives';
import { SiteHeader } from './site-header';
import { LanguageSwitcher } from './language-switcher';
import { SosFloatingBar } from '@/components/emergency/sos-floating-bar';
import { SosDialog } from '@/components/emergency/sos-dialog';
import { ReliefAssistant } from '@/components/assistant/relief-assistant';
import { reportCodeFromId } from '@/lib/utils';
import { DEMO_NOW } from '@/lib/time';
import { LocaleProvider, useLocale } from '@/lib/i18n';

const MOBILE_NAV = [
  { href: '/dashboard', labelKey: 'nav.mobile.home', icon: LayoutDashboard },
  { href: '/reports', labelKey: 'nav.mobile.reports', icon: FileText },
  { href: '/chat', labelKey: 'nav.mobile.assistant', icon: MessageSquareText },
  { href: '/resources', labelKey: 'nav.mobile.help', icon: LifeBuoy },
];

/**
 * App shell: providers, skip link, header, content, mobile nav, assistant
 * launcher, SOS bar, and the SOS dialog that any surface can open.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    // Order is load-bearing. `useSession` throws if it is not inside a
    // SessionProvider, and AppProvider calls it to derive the session user, so
    // SessionProvider has to stay on the *outside*. Swapping these two takes
    // down every route at once rather than degrading one component.
    //
    // `LocaleProvider` sits directly inside it for the same reason: every
    // surface below needs `t`, and the shell itself is one of them. `AiChatProvider`
    // is inside `AppProvider` for the same reason, and it wraps every route so
    // the intake survives navigation. It has to be a single instance for the
    // whole tree: the floating launcher on `/dashboard` and the full-page
    // assistant on `/chat` are the same conversation, and two instances would
    // mean two drafts, two session ids and two divergent transcripts for one
    // reporter.
    <SessionProvider>
      <LocaleProvider>
        <AppProvider>
          <ToastProvider>
            <AiChatProvider>
              <Shell>{children}</Shell>
            </AiChatProvider>
          </ToastProvider>
        </AppProvider>
      </LocaleProvider>
    </SessionProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  // `sosOpen` lives in the store rather than here, so any surface can raise an
  // emergency and not only the four this shell owns. See `AppContextValue`.
  const { reports, actionCards, sosOpen, openSos, closeSos } = useApp();
  const { toast } = useToast();
  const pathname = usePathname();
  const { t } = useLocale();

  // The conversation's single intake, mounted once in `AppShell`. The floating
  // assistant's draft therefore survives navigating between routes (state is
  // in-memory, so a reload still resets it — see AGENTS.md) and is the *same*
  // draft `/chat` fills in.
  const ai = useAiChatInstance();

  const pendingCards = actionCards.filter((c) => c.status === 'pending').length;
  const activeCount = reports.filter((r) => r.currentStage !== 'resolved').length;

  // Tell the user when the assistant captures something new, anywhere in the app.
  // `t` is read through a ref rather than a dependency: this fires on a change in
  // pending cards, and re-toasting on a language switch would be noise.
  const tRef = React.useRef(t);
  tRef.current = t;
  React.useEffect(() => {
    if (pendingCards === 0) return;
    toast({
      tone: 'info',
      title: tRef.current('toast.captured.title'),
      description: tRef.current('toast.captured.body'),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCards]);

  /**
   * Fires only after a ticket row exists — the dialog owns the sending and the
   * failure states, and this is told when it genuinely succeeded.
   *
   * "Nearest units are en route" was removed: nothing dispatches automatically.
   * The ticket is in the queue awaiting triage, and that is the whole of what
   * can be claimed at this point.
   */
  const onSosDispatched = React.useCallback(
    (reportId: string) => {
      toast({
        tone: 'critical',
        title: tRef.current('toast.sosSent.title'),
        description: tRef.current('toast.sosSent.body', { code: reportCodeFromId(reportId) }),
      });
    },
    [toast],
  );

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <a href="#main" className="skip-link">
        {t('a11y.skipToMain')}
      </a>

      <SiteHeader onOpenSos={openSos} />

      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>

      <SiteFooter onOpenSos={openSos} />

      {/* Persistent quick access.
          The assistant dock sits directly above the SOS bar (≈6.5rem tall on
          desktop) so the two never overlap. */}
      <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+7rem)] right-4 z-[61] hidden flex-col items-end sm:flex">
        <ReliefAssistant variant="floating" ai={ai} />
      </div>

      <SosFloatingBar onOpenSos={openSos} unreadCount={activeCount} />

      <MobileTabBar pathname={pathname} />

      <SosDialog
        open={sosOpen}
        onClose={closeSos}
        onDispatched={onSosDispatched}
      />
    </div>
  );
}

function MobileTabBar({ pathname }: { pathname: string }) {
  const { t } = useLocale();
  return (
    <nav
      aria-label={t('a11y.primaryNavMobile')}
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
                <span className="text-2xs font-bold tracking-tight">{t(item.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SiteFooter({ onOpenSos }: { onOpenSos: () => void }) {
  const { user } = useApp();
  const { t } = useLocale();
  return (
    <footer className="no-print mt-16 border-t border-navy-200 bg-white pb-[var(--content-bottom)] sm:pb-10">
      <div className="container py-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:justify-between">
          <div className="max-w-sm">
            <p className="text-sm font-bold text-navy-900">FLARE Relief Network</p>
            <p className="mt-1.5 text-sm leading-relaxed text-navy-500">{t('footer.about')}</p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <FooterCol
              title={t('footer.getHelp')}
              links={[
                { label: t('sos.button'), action: onOpenSos },
                { label: t('footer.reportIncident'), href: '/chat' },
                { label: t('footer.findShelter'), href: '/resources' },
                { label: t('footer.voice'), href: '/chat' },
              ]}
            />
            <FooterCol
              title={t('footer.account')}
              links={[
                { label: t('nav.dashboard'), href: '/dashboard' },
                { label: t('nav.reports'), href: '/reports' },
                /* Only when there is an account to attach them to. `/tickets` is
                   gated, so a signed-out visitor gets a link that throws them
                   into a Google round-trip to reach an empty list. */
                ...(user ? [{ label: t('nav.tickets'), href: '/tickets' as const }] : []),
                { label: t('btn.signIn'), href: '/login' },
              ]}
            />
            <FooterCol
              title={t('footer.assurance')}
              links={[
                { label: t('footer.howTriage'), href: '/resources' },
                { label: t('footer.accessibility'), href: '/resources' },
                { label: t('footer.verification'), href: '/resources' },
              ]}
            />
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-navy-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-navy-400">{t('sos.footer.warn')}</p>
          <p className="text-xs text-navy-400">
            {t('footer.rights', { year: DEMO_NOW.getFullYear() })}
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
      <Eyebrow>{title}</Eyebrow>
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
