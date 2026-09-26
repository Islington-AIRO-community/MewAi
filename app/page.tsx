'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Brain,
  Building2,
  CheckCircle2,
  Eye,
  HeartPulse,
  Keyboard,
  Mic,
  Radio,
  ShieldCheck,
  Siren,
  Sparkles,
  Waves,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmergencyStatusBadge } from '@/components/emergency/emergency-status-badge';
import { ReportCard } from '@/components/reports/report-card';
import { DEPARTMENTS, SYSTEM_STATUS } from '@/lib/types';
import { useApp } from '@/lib/store';
import { formatNumber } from '@/lib/utils';

const STEPS = [
  {
    icon: Mic,
    title: 'Speak or type',
    body: 'No forms, no dropdowns. Say “we are trapped on the third floor” in your own words and the assistant takes it from there.',
  },
  {
    icon: Brain,
    title: 'It reads the details',
    body: 'People affected, injuries, hazards and urgency are extracted and shown back to you with a confidence score on each.',
  },
  {
    icon: Building2,
    title: 'It finds the right team',
    body: 'The request is matched to the department with capacity closest to you — medical, SAR, shelter, logistics or fire.',
  },
  {
    icon: CheckCircle2,
    title: 'You confirm, then track',
    body: 'Nothing is sent without your confirmation. Then follow every step, from submitted to resolved.',
  },
];

const GUARANTEES = [
  { icon: ShieldCheck, title: 'Human confirmed', body: 'The AI prepares requests. A person always presses send.' },
  { icon: Eye, title: 'You control location', body: 'Coordinates are shared only when you send a request.' },
  { icon: Keyboard, title: 'Keyboard first', body: 'Every control is reachable by keyboard, with visible focus.' },
  { icon: Waves, title: 'Low bandwidth', body: 'Text-first, small payloads, works on older phones.' },
];

export default function LandingPage() {
  const { reports, openSos } = useApp();
  const sample = reports.find((r) => r.currentStage === 'dispatched') ?? reports[0];

  return (
    <div className="pb-24 sm:pb-16">
      {/* ================= Hero ================= */}
      <section className="relative overflow-hidden bg-navy-950">
        <div className="pointer-events-none absolute inset-0 surface-grid-dark opacity-50" aria-hidden="true" />
        <div
          className="pointer-events-none absolute -left-40 top-0 size-[36rem] rounded-full bg-emergency-600/20 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-40 bottom-0 size-[32rem] rounded-full bg-dispatch-600/20 blur-3xl"
          aria-hidden="true"
        />

        <div className="container relative grid items-center gap-12 py-14 lg:grid-cols-12 lg:py-20">
          <div className="lg:col-span-7">
            <div className="flex flex-wrap items-center gap-2.5">
              <EmergencyStatusBadge size="sm" />
              <Badge tone="glass" size="sm">
                <Radio className="size-3" aria-hidden="true" />
                {formatNumber(SYSTEM_STATUS.activeResponders)} responders active
              </Badge>
            </div>

            <h1 className="mt-6 text-balance text-4xl font-extrabold leading-[1.06] tracking-[-0.02em] text-white sm:text-5xl lg:text-6xl">
              Relief that answers
              <br />
              the moment you need it.
            </h1>

            <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-white/70 sm:text-lg">
              FLARE turns a sentence of panic into a dispatched crew. Describe what is happening by
              voice or text, confirm what we understood, and watch the response arrive — step by
              step, in plain language.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {/*
                An actual button, not a `Link`. This control was a link to
                `/dashboard` wearing an emergency label and a critical stripe,
                so the loudest call to action on the entry page did not raise an
                emergency — it navigated somewhere else. The dialog is shell
                state reached through the store, which is why a page can open it
                at all.
              */}
              <Button
                type="button"
                variant="accent"
                size="xl"
                className="stripe-critical"
                onClick={openSos}
              >
                <Siren aria-hidden="true" />
                Send an emergency SOS
              </Button>
              <Button
                asChild
                variant="outlineNavy"
                size="xl"
                className="border-white/25 bg-white/5"
              >
                <Link href="/chat">
                  <Mic aria-hidden="true" />
                  Talk to the assistant
                </Link>
              </Button>
            </div>

            <p className="mt-5 flex items-center gap-2 text-xs text-white/45">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              No account needed for SOS. Works on any phone.
            </p>
          </div>

          {/* Hero visual: a live report card */}
          <div className="lg:col-span-5">
            <div className="relative">
              <div
                className="pointer-events-none absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-dispatch-500/15 to-emergency-500/15 blur-2xl"
                aria-hidden="true"
              />
              <div className="relative rounded-3xl border border-white/10 bg-white/5 p-3 backdrop-blur-xl">
                <div className="mb-3 flex items-center gap-2.5 px-1">
                  <span className="grid size-8 place-items-center rounded-lg bg-emergency-500 text-white">
                    <Zap className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white">Trapped in basement</p>
                    <p className="text-2xs text-white/50">3 people · rising water</p>
                  </div>
                  <span className="ml-auto flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-1 text-2xs font-bold text-white ring-1 ring-inset ring-white/15">
                    <span className="relative flex size-1.5">
                      <span className="absolute inset-0 animate-pulse-ring rounded-full bg-relief-400" />
                      <span className="relative size-1.5 rounded-full bg-relief-400" />
                    </span>
                    LIVE
                  </span>
                </div>

                <div className="rounded-2xl bg-white p-1">
                  {/* `titleTag="p"`: this is a teaser inside the hero, so it must
                      not inject an h3 between the page h1 and the next h2. */}
                  {sample && <ReportCard report={sample} compact titleTag="p" />}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    { label: 'Reports', value: '1,284' },
                    { label: 'Resolved', value: '1,129' },
                    { label: 'Median', value: '9 min' },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-center"
                    >
                      <p className="nums text-base font-extrabold text-white">{s.value}</p>
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/40">
                        {s.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= How it works ================= */}
      <section className="border-b border-navy-200 bg-white" aria-labelledby="how-heading">
        <div className="container py-14 sm:py-18">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-dispatch-600">
              How it works
            </p>
            <h2
              id="how-heading"
              className="mt-3 text-balance text-2xl font-extrabold leading-tight tracking-tight text-navy-900 sm:text-3xl"
            >
              Four steps, and you always know where you are.
            </h2>
          </div>

          <ol className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative">
                <span
                  className="nums absolute -top-2 -left-1 z-10 grid size-7 place-items-center rounded-full bg-navy-900 text-2xs font-black text-white ring-4 ring-white"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <Card className="h-full p-5 pt-6">
                  <span className="grid size-10 place-items-center rounded-xl bg-navy-50 text-navy-700 ring-1 ring-inset ring-navy-200">
                    <s.icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-3.5 text-sm font-bold text-navy-900">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-navy-500">{s.body}</p>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ================= Departments ================= */}
      <section className="border-b border-navy-200 bg-surface" aria-labelledby="dept-heading">
        <div className="container py-14">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-dispatch-600">
                Response network
              </p>
              <h2
                id="dept-heading"
                className="mt-3 text-2xl font-extrabold leading-tight tracking-tight text-navy-900 sm:text-3xl"
              >
                {DEPARTMENTS.length} verified teams, live capacity.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-navy-500">
                FLARE routes to whoever can actually arrive fastest — not just whoever is closest on a
                map.
              </p>
            </div>
            <Button asChild variant="outline" size="lg">
              <Link href="/dashboard">
                See the network
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <div className="mt-8 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {DEPARTMENTS.map((dept) => (
              <Card key={dept.id} className="p-5">
                <div className="flex items-start gap-3">
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy-900 text-white"
                    aria-hidden="true"
                  >
                    <dept.icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold leading-snug text-navy-900">{dept.name}</h3>
                    <p className="mt-0.5 text-xs text-navy-500">{dept.coverage}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-navy-100 pt-3.5">
                  <span className="nums text-xs font-bold text-navy-700">
                    {dept.crewsAvailable}/{dept.crewsTotal} crews
                  </span>
                  <span className="nums text-xs text-navy-500">
                    ~{dept.avgResponseMinutes} min
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ================= Guarantees ================= */}
      <section className="bg-white" aria-labelledby="trust-heading">
        <div className="container py-14">
          <h2
            id="trust-heading"
            className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl"
          >
            Designed for trust, not for panic.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-navy-500">
            Emergency software is used when people are frightened. That shapes every decision here.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {GUARANTEES.map((g) => (
              <div
                key={g.title}
                className="rounded-2xl border border-navy-200 bg-surface p-5"
              >
                <span className="grid size-9 place-items-center rounded-lg bg-white text-navy-700 ring-1 ring-inset ring-navy-200">
                  <g.icon className="size-4" aria-hidden="true" />
                </span>
                <h3 className="mt-3 text-sm font-bold text-navy-900">{g.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-navy-500">{g.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="relative overflow-hidden bg-navy-900">
        <div className="pointer-events-none absolute inset-0 surface-grid-dark opacity-40" aria-hidden="true" />
        <div className="container relative py-14 text-center sm:py-18">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-2xs font-bold uppercase tracking-[0.12em] text-white/70 ring-1 ring-inset ring-white/15">
            <Sparkles className="size-3" aria-hidden="true" />
            Live Relief Mode
          </span>

          <h2 className="mx-auto mt-5 max-w-2xl text-balance text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
            The fastest way to get help is already on your screen.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-sm leading-relaxed text-white/60 sm:text-base">
            Open the dashboard to see live requests, or go straight to the assistant. Either way,
            SOS is one tap away.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild variant="accent" size="xl" className="stripe-critical">
              <Link href="/dashboard">
                <HeartPulse aria-hidden="true" />
                Open dashboard
              </Link>
            </Button>
            <Button asChild variant="outlineNavy" size="xl">
              <Link href="/login">
                <ShieldCheck aria-hidden="true" />
                Sign in
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
