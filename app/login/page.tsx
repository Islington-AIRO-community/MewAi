'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Eye,
  Fingerprint,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmergencyStatusBadge } from '@/components/emergency/emergency-status-badge';
import { SYSTEM_STATUS } from '@/lib/types';

/** Inline Google "G" mark — no external image request. */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.45a5.5 5.5 0 0 1-2.39 3.61v3h3.86c2.26-2.08 3.58-5.15 3.58-8.79Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.86-3c-1.08.72-2.45 1.15-4.08 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.29a12 12 0 0 0 0 10.76l3.98-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l3.98 3.1C6.22 6.87 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

const TRUST = [
  { icon: ShieldCheck, label: 'No password to forget in an emergency' },
  { icon: Fingerprint, label: 'Identity verified, never shared with responders' },
  { icon: Eye, label: 'Location shared only when you send a request' },
];

/** Signed-out visitors land on the dashboard unless turned away from a page. */
const DEFAULT_DESTINATION = '/dashboard';

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const [pending, setPending] = React.useState(false);
  const [destination, setDestination] = React.useState(DEFAULT_DESTINATION);

  /**
   * Where to send the user once Google comes back.
   *
   * Read from `window.location` in a mount effect rather than with
   * `useSearchParams()`. `useSearchParams` would force this route behind a
   * Suspense boundary — the same split `/chat` uses for its `?intent=` deep
   * links — and a login page is the worst place to flash a skeleton when it is
   * already showing a spinner on the button. This runs once after mount, which
   * is before anyone can click.
   *
   * `middleware.ts` sends unauthenticated visitors here with
   * `?callbackUrl=/reports`, so signing in returns them to the page they asked
   * for rather than dumping them on the dashboard.
   */
  React.useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('callbackUrl');
    if (!requested) return;
    // Same-origin only, decided by *parsing* rather than by matching a prefix.
    //
    // A `startsWith('/')` check looks sufficient and is not. The URL parser
    // treats a backslash as a slash for special schemes and strips tab/newline,
    // so `?callbackUrl=/\evil.example` and `?callbackUrl=/<tab>/evil.example`
    // both pass a naive slash test and still resolve to another host — an open
    // redirect through the OAuth return trip. Resolving first and comparing
    // origins catches every variant at once, including `//host` and
    // `javascript:`.
    try {
      const target = new URL(requested, window.location.origin);
      if (target.origin !== window.location.origin) return;
      setDestination(target.pathname + target.search + target.hash);
    } catch {
      // Unparseable input: keep the default destination rather than guessing.
    }
  }, []);

  const handleGoogle = React.useCallback(() => {
    setPending(true);
    // Real OAuth: this navigates the whole page to Google's consent screen and
    // back. There is no in-page state to unwind — `pending` only disables the
    // button and shows the spinner across the hand-off.
    void signIn('google', { callbackUrl: destination });
  }, [destination]);

  // Already signed in? Skip the form. Keyed on `authenticated` rather than
  // `status !== 'loading'` so the bounce cannot fire before the session has
  // actually resolved, and cannot fire at all for a signed-out visitor.
  React.useEffect(() => {
    if (status === 'authenticated') {
      router.replace(destination);
      router.refresh();
    }
  }, [status, destination, router]);

  return (
    <div className="relative min-h-[calc(100dvh-4.25rem)] overflow-hidden bg-navy-950">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 surface-grid-dark opacity-50" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -right-40 -top-40 size-[38rem] rounded-full bg-dispatch-600/20 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-52 -left-32 size-[34rem] rounded-full bg-emergency-600/20 blur-3xl"
        aria-hidden="true"
      />

      <div className="container relative grid min-h-[calc(100dvh-4.25rem)] items-center gap-12 py-12 lg:grid-cols-2 lg:gap-16 lg:py-16">
        {/* ---- Left: value proposition ---- */}
        <div className="max-w-xl">
          <Link
            href="/"
            className="inline-flex rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950"
          >
            <Logo tone="light" />
          </Link>

          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <EmergencyStatusBadge size="sm" />
            <Badge tone="glass" size="sm">
              <Sparkles className="size-3" aria-hidden="true" />
              Live Relief Mode
            </Badge>
          </div>

          <h1 className="mt-6 text-balance text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
            Get help in the
            <span className="relative mx-2 inline-block">
              <span className="relative z-10">three taps</span>
              <span
                className="absolute inset-x-0 bottom-1 z-0 h-3 rounded-sm bg-emergency-500/40"
                aria-hidden="true"
              />
            </span>
            it takes to open this screen.
          </h1>

          <p className="mt-5 max-w-lg text-pretty text-base leading-relaxed text-white/70 sm:text-lg">
            FLARE listens by voice or text, routes your request to the right response team, and
            keeps you and your responders on the same page — every step, in real time.
          </p>

          <ul className="mt-8 space-y-3">
            {TRUST.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-start gap-3 text-sm text-white/80">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-relief-500/20 text-relief-300">
                  <Icon className="size-3" aria-hidden="true" />
                </span>
                {label}
              </li>
            ))}
          </ul>

          {/* Live metrics strip */}
          <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
            {[
              { label: 'Responders active', value: SYSTEM_STATUS.activeResponders },
              { label: 'Open incidents', value: SYSTEM_STATUS.openIncidents },
              { label: 'Median response', value: '9 min' },
            ].map((s) => (
              <div key={s.label}>
                <dt className="text-2xs font-bold uppercase tracking-[0.1em] text-white/40">
                  {s.label}
                </dt>
                <dd className="nums mt-1 text-2xl font-extrabold text-white">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ---- Right: auth card ---- */}
        <div className="mx-auto w-full max-w-md lg:ml-auto">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-white shadow-lift">
            <div className="px-6 pb-6 pt-7 sm:px-8 sm:pb-8 sm:pt-8">
              <h2 className="text-xl font-extrabold tracking-tight text-navy-900">
                Sign in to FLARE
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-navy-500">
                Signing in lets responders reach you and keeps your report history in one place.
                You can send an SOS without signing in.
              </p>

              <Button
                onClick={handleGoogle}
                loading={pending}
                disabled={pending || status === 'authenticated'}
                size="xl"
                block
                className="mt-6 border-navy-200 bg-white text-navy-800 hover:border-navy-300 hover:bg-navy-50"
                variant="outline"
              >
                <GoogleMark className="size-5 shrink-0" />
                Continue with Google
              </Button>

              <p className="mt-3.5 text-center text-xs leading-relaxed text-navy-400">
                Google verifies your email. FLARE never sees your password, and does not share
                your identity with response teams.
              </p>
            </div>

            {/* Emergency escape hatch */}
            <div className="border-t border-navy-100 bg-emergency-50/70 px-6 py-5 sm:px-8">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emergency-500 text-white">
                  <PhoneCall className="size-4.5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-emergency-800">
                    Need help right now?
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-emergency-700">
                    Send an SOS without signing in. Your location goes straight to the nearest crew.
                  </p>
                </div>
              </div>
              <Button asChild variant="sos" size="lg" block className="mt-3.5 stripe-critical">
                <Link href="/dashboard">
                  <PhoneCall aria-hidden="true" />
                  Send emergency SOS
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>

          {/* Assurances */}
          <ul className="mt-5 space-y-2 px-1">
            {[
              { icon: Brain, text: 'AI drafts the request — a human always confirms before dispatch' },
              { icon: CheckCircle2, text: 'WCAG 2.2 AA: keyboard, screen reader and reduced-motion ready' },
              { icon: UserRound, text: 'Works on low-bandwidth connections and older phones' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-2.5 text-xs text-white/50">
                <Icon className="mt-0.5 size-3.5 shrink-0 text-white/40" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
