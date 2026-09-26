'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  Eye,
  Fingerprint,
  LogIn,
  Mail,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/primitives';
import { EmergencyStatusBadge } from '@/components/emergency/emergency-status-badge';
import { useApp, type SessionUser } from '@/lib/store';
import { SYSTEM_STATUS } from '@/lib/types';
import { cn } from '@/lib/utils';

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

export default function LoginPage() {
  const router = useRouter();
  const { user, signIn } = useApp();
  const [pending, setPending] = React.useState<'google' | 'email' | null>(null);
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const redirect = React.useCallback(() => {
    router.push('/dashboard');
    router.refresh();
  }, [router]);

  const handleGoogle = React.useCallback(() => {
    setPending('google');
    setError(null);
    // Mock OAuth handshake: redirect to the consent screen, then back.
    window.setTimeout(() => {
      signIn({
        name: 'Amara Okafor',
        email: 'amara.okafor@example.org',
        avatarHref: null,
        initials: 'AO',
        verified: true,
      });
      redirect();
    }, 1100);
  }, [signIn, redirect]);

  const handleEmail = React.useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        setError('Enter a valid email address to continue.');
        return;
      }
      setPending('email');
      setError(null);
      window.setTimeout(() => {
        signIn({
          name: email.split('@')[0].replace(/[._-]/g, ' '),
          email,
          avatarHref: null,
          initials: '',
          verified: false,
        } satisfies SessionUser);
        redirect();
      }, 800);
    },
    [email, signIn, redirect],
  );

  // Already signed in? Skip the form.
  React.useEffect(() => {
    if (user) redirect();
  }, [user, redirect]);

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
                loading={pending === 'google'}
                disabled={pending !== null && pending !== 'google'}
                size="xl"
                block
                className="mt-6 border-navy-200 bg-white text-navy-800 hover:border-navy-300 hover:bg-navy-50"
                variant="outline"
              >
                <GoogleMark className="size-5 shrink-0" />
                Continue with Google
              </Button>

              <div className="my-5 flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-2xs font-bold uppercase tracking-[0.1em] text-navy-400">
                  or use email
                </span>
                <Separator className="flex-1" />
              </div>

              <form onSubmit={handleEmail} noValidate>
                <label
                  htmlFor="email"
                  className="block text-2xs font-bold uppercase tracking-[0.08em] text-navy-400"
                >
                  Email address
                </label>
                <div className="relative mt-1.5">
                  <Mail
                    className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-navy-400"
                    aria-hidden="true"
                  />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'email-error' : 'email-hint'}
                    placeholder="you@example.org"
                    className={cn(
                      'h-12 w-full rounded-xl border bg-white pl-10 pr-4 text-[15px] text-navy-800',
                      'placeholder:text-navy-400',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600 focus-visible:ring-offset-1',
                      error ? 'border-emergency-400 ring-emergency-200' : 'border-navy-200',
                    )}
                  />
                </div>

                {error ? (
                  <p
                    id="email-error"
                    role="alert"
                    className="mt-2 text-sm font-semibold text-emergency-700"
                  >
                    {error}
                  </p>
                ) : (
                  <p id="email-hint" className="mt-2 text-xs text-navy-400">
                    We will send a one-time link. No password required.
                  </p>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="xl"
                  block
                  loading={pending === 'email'}
                  disabled={pending !== null && pending !== 'email'}
                  className="mt-4"
                >
                  <LogIn aria-hidden="true" />
                  Email me a sign-in link
                </Button>
              </form>
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
