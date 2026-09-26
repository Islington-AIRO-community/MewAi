'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MapPin,
  Mic,
  Phone,
  Settings,
  User,
  FileText,
  ChevronDown,
  MessageSquareText,
  Ticket,
} from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import { useApp } from '@/lib/store';
import { useDismissable, useFocusTrap } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Logo } from './logo';
import { EmergencyStatusBadge } from '@/components/emergency/emergency-status-badge';
import { SosButton } from '@/components/emergency/sos-button';
import { SYSTEM_STATUS } from '@/lib/types';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  shortLabel: string;
  /**
   * Hidden from signed-out visitors.
   *
   * `/tickets` is gated in `middleware.ts`, so showing it to someone with no
   * session means a dead link that bounces to a Google round-trip. That is the
   * wrong first impression for the one page a returning reporter opens to check
   * whether help is coming, and the wrong thing to ask of someone who is here
   * during a disaster and has no account.
   */
  signedInOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, shortLabel: 'Home' },
  { href: '/reports', label: 'My Reports', icon: FileText, shortLabel: 'Reports' },
  { href: '/chat', label: 'AI Assistant', icon: MessageSquareText, shortLabel: 'Assist' },
  { href: '/tickets', label: 'My Tickets', icon: Ticket, shortLabel: 'Tickets', signedInOnly: true },
  { href: '/resources', label: 'Resources', icon: LifeBuoy, shortLabel: 'Help' },
];

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
}

export function SiteHeader({ onOpenSos }: { onOpenSos: () => void }) {
  const pathname = usePathname();
  const { user } = useApp();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const close = React.useCallback(() => setMenuOpen(false), []);
  const menuRef = useDismissable<HTMLDivElement>(menuOpen, close);
  const trapRef = useFocusTrap<HTMLDivElement>(menuOpen);

  // Close on route change.
  React.useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-50 no-print">
      {/* Relief-mode bar: 3px of unmistakable state colour. */}
      <div className="h-1 w-full bg-gradient-to-r from-navy-900 via-dispatch-600 to-emergency-500" />

      <div className="border-b border-navy-200/80 bg-white/85 backdrop-blur-xl">
        <div className="container flex h-16 items-center gap-3 sm:h-[68px]">
          <Link
            href="/dashboard"
            className="shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600 focus-visible:ring-offset-2"
            aria-label="FLARE Relief Network — home"
          >
            <Logo />
            <span className="sr-only">FLARE Relief Network, home</span>
          </Link>

          <Badge tone="navy" size="xs" className="hidden shrink-0 lg:inline-flex">
            BETA
          </Badge>

          {/* Desktop nav */}
          <nav aria-label="Primary" className="ml-4 hidden lg:block">
            <ul className="flex items-center gap-1">
              {NAV.filter((item) => !item.signedInOnly || user).map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'inline-flex min-h-[40px] items-center gap-2 rounded-lg px-3 text-sm font-semibold no-tap-highlight',
                        'transition-colors duration-200',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600 focus-visible:ring-offset-2',
                        active
                          ? 'bg-navy-100 text-navy-900'
                          : 'text-navy-500 hover:bg-navy-50 hover:text-navy-900',
                      )}
                    >
                      <item.icon className="size-4" aria-hidden="true" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex-1" />

          <div className="hidden items-center gap-2 md:flex">
            <EmergencyStatusBadge size="sm" />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={onOpenSos}
            >
              <Phone aria-hidden="true" />
              <span className="hidden lg:inline">Emergency Contact</span>
              <span className="lg:hidden">SOS</span>
            </Button>

            <SosButton
              size="sm"
              className="sm:hidden"
              onClick={onOpenSos}
              srLabel="Open SOS emergency distress reporting"
            />

            {/* Branches on `user` alone, which is null while the session is
                still loading as well as when signed out. Rendering nothing
                during loading was tried and is worse: because these routes are
                statically prerendered, the prerendered HTML always contains the
                "Sign in" button, so hiding it during loading makes that button
                blink out and back on *every* page load. This way the signed-out
                case (the common one) is stable, and a signed-in visitor sees
                the button swap to the account menu once the cookie is read.
                Eliminating that swap entirely would mean server-rendering the
                session on every route, i.e. making them all dynamic. */}
            {user ? (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  className={cn(
                    'inline-flex min-h-[40px] items-center gap-2 rounded-full border border-navy-200 bg-white pl-1 pr-2.5 shadow-xs no-tap-highlight',
                    'transition-colors duration-200 hover:border-navy-300 hover:bg-navy-50',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600 focus-visible:ring-offset-2',
                  )}
                >
                  <Avatar user={user} />
                  <ChevronDown
                    className={cn(
                      'size-4 text-navy-400 transition-transform duration-200',
                      menuOpen && 'rotate-180',
                    )}
                    aria-hidden="true"
                  />
                  <span className="sr-only">Account menu</span>
                </button>

                {menuOpen && (
                  <div
                    ref={trapRef}
                    role="menu"
                    aria-label="Account"
                    className="absolute right-0 top-[calc(100%+0.5rem)] w-72 animate-slide-up overflow-hidden rounded-2xl border border-navy-200 bg-white shadow-lift"
                  >
                    <div className="flex items-start gap-3 border-b border-navy-100 bg-navy-50/70 p-4">
                      <Avatar user={user} size="lg" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-navy-900">{user.name}</p>
                        <p className="truncate text-xs text-navy-500">{user.email}</p>
                        {user.verified && (
                          <Badge tone="relief" size="xs" className="mt-1.5">
                            Identity verified
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="p-1.5">
                      <MenuLink href="/tickets" icon={Ticket} label="My tickets" />
                      <MenuLink href="/reports" icon={FileText} label="My reports" />
                      <MenuLink href="/chat" icon={Mic} label="Voice assistant" />
                      <MenuLink href="/resources" icon={LifeBuoy} label="Relief resources" />
                      <MenuLink href="/dashboard" icon={MapPin} label="Location & safety" />
                    </div>

                    <div className="border-t border-navy-100 p-1.5">
                      <button
                        role="menuitem"
                        type="button"
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-navy-600 no-tap-highlight hover:bg-navy-50 hover:text-navy-900"
                      >
                        <Settings className="size-4" aria-hidden="true" />
                        Settings
                      </button>
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          // next-auth's signOut, not the store's old setter: it
                          // clears the httpOnly session cookie, which is what
                          // actually ends the session. `callbackUrl: '/'` lands
                          // them somewhere sensible, and because `user` is
                          // derived from the session the whole UI updates on its
                          // own once the cookie is gone.
                          void signOut({ callbackUrl: '/' });
                          close();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-emergency-700 no-tap-highlight hover:bg-emergency-50"
                      >
                        <LogOut className="size-4" aria-hidden="true" />
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Button asChild size="sm" className="shrink-0">
                <Link href="/login">
                  <User aria-hidden="true" />
                  <span className="hidden sm:inline">Sign in</span>
                  <span className="sm:hidden">In</span>
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile status strip */}
      <div className="flex items-center justify-between gap-3 border-b border-navy-200/80 bg-navy-900 px-4 py-2 md:hidden">
        <EmergencyStatusBadge size="sm" className="shrink-0" />
        <p className="truncate text-2xs font-medium text-white/60">
          {SYSTEM_STATUS.activeResponders} responders active
        </p>
      </div>
    </header>
  );
}

function MenuLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof FileText;
  label: string;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-navy-700 no-tap-highlight hover:bg-navy-50 hover:text-navy-900"
    >
      <Icon className="size-4 text-navy-400" aria-hidden="true" />
      {label}
    </Link>
  );
}

export function Avatar({
  user,
  size = 'md',
}: {
  user: { name: string; avatarHref: string | null };
  size?: 'sm' | 'md' | 'lg';
}) {
  const cls = cn(
    'grid shrink-0 place-items-center overflow-hidden rounded-full bg-navy-800 font-bold text-white ring-1 ring-navy-900/10',
    size === 'sm' && 'size-7 text-2xs',
    size === 'md' && 'size-8 text-xs',
    size === 'lg' && 'size-11 text-sm',
  );

  if (user.avatarHref) {
    // Avatars are generated locally as data URIs, so there is no network
    // request and no need for next/image optimisation.
    return (
      <span
        role="img"
        aria-label=""
        className={cn(cls, 'bg-cover bg-center')}
        style={{ backgroundImage: `url("${user.avatarHref}")` }}
      />
    );
  }
  return (
    <span className={cls} aria-hidden="true">
      {initials(user.name)}
    </span>
  );
}
