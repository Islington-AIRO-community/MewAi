'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Brain,
  Building2,
  CheckCircle2,
  ChevronRight,
  Compass,
  Droplets,
  Flame,
  HeartPulse,
  Home,
  Mic,
  Search,
  Siren,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmergencyStatusBadge } from '@/components/emergency/emergency-status-badge';
import { StatCard } from '@/components/reports/stat-card';
import { ReportCard, ReportRow } from '@/components/reports/report-card';
import { LiveDot } from '@/components/reports/badges';
import { DASHBOARD_STATS, TRIAGE_FEED } from '@/lib/mock-data';
import {
  CATEGORIES,
  DEPARTMENTS,
  DEPARTMENT_STATUS_STYLES,
  SYSTEM_STATUS,
} from '@/lib/types';
import { useApp } from '@/lib/store';
import { greetingFor } from '@/lib/time';
import { cn, formatNumber, shortStamp } from '@/lib/utils';

const QUICK_ACTIONS = [
  {
    href: '/chat',
    label: 'Report by voice',
    hint: 'Hands-free, no typing',
    icon: Mic,
    tone: 'bg-navy-900 text-white',
  },
  {
    href: '/chat',
    label: 'Describe in text',
    hint: 'AI routes it for you',
    icon: Brain,
    tone: 'bg-white text-navy-800',
  },
  {
    href: '/resources',
    label: 'Find shelter & supplies',
    hint: 'Open nearby locations',
    icon: Home,
    tone: 'bg-white text-navy-800',
  },
] as const;

const CATEGORY_ICONS = {
  medical: HeartPulse,
  shelter: Home,
  'food-water': Droplets,
  'search-rescue': Search,
  infrastructure: Flame,
  'missing-person': Users,
  evacuation: Compass,
} as const;

export default function DashboardPage() {
  const { reports, user } = useApp();

  const active = React.useMemo(
    () =>
      reports
        .filter((r) => r.currentStage !== 'resolved')
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [reports],
  );

  const critical = React.useMemo(
    () => active.filter((r) => r.priority === 'critical'),
    [active],
  );

  const resolved = React.useMemo(
    () => reports.filter((r) => r.currentStage === 'resolved'),
    [reports],
  );

  // Derived from the fixed demo clock so the prerendered HTML and the hydrated
  // client always agree — see lib/time.ts.
  const greeting = React.useMemo(() => greetingFor(), []);

  return (
    <div className="pb-32 sm:pb-16">
      {/* ================= Hero ================= */}
      <section className="relative overflow-hidden border-b border-navy-800 bg-navy-900">
        <div className="pointer-events-none absolute inset-0 surface-grid-dark opacity-40" aria-hidden="true" />
        <div
          className="pointer-events-none absolute -right-24 -top-32 size-[32rem] rounded-full bg-dispatch-600/18 blur-3xl"
          aria-hidden="true"
        />

        <div className="container relative py-7 sm:py-9">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <EmergencyStatusBadge size="md" />
                <span className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-[0.1em] text-white/45">
                  <LiveDot className="text-relief-400" label={`${formatNumber(SYSTEM_STATUS.activeResponders)} active`} />
                </span>
              </div>

              <h1 className="mt-4 text-balance text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-3xl">
                {greeting}
                {user ? `, ${user.name.split(' ')[0]}` : ''}. Here is where your requests stand.
              </h1>

              <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-white/60 sm:text-base">
                {active.length === 0
                  ? 'Nothing needs attention right now. If something changes, the assistant is one tap away.'
                  : `You have ${active.length} open request${active.length === 1 ? '' : 's'}` +
                    `${critical.length > 0 ? `, including ${critical.length} critical` : ''}. ` +
                    'Every update below arrives as a responder acts on it.'}
              </p>
            </div>

            {/* Quick actions */}
            <div className="grid shrink-0 grid-cols-1 gap-2.5 sm:grid-cols-3 lg:w-[30rem]">
              {QUICK_ACTIONS.map((a) => (
                <Button
                  key={a.label}
                  asChild
                  variant={a.tone.includes('navy-900') ? 'white' : 'outline'}
                  size="lg"
                  className={cn('justify-start gap-3 text-left', !a.tone.includes('navy-900') && 'bg-white/95')}
                >
                  <Link href={a.href}>
                    <a.icon className="size-5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{a.label}</span>
                      <span
                        className={cn(
                          'block truncate text-2xs font-medium',
                          a.tone.includes('navy-900') ? 'text-navy-500' : 'text-navy-400',
                        )}
                      >
                        {a.hint}
                      </span>
                    </span>
                  </Link>
                </Button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="container py-7 sm:py-9">
        {/* ================= Stats ================= */}
        <section aria-labelledby="stats-heading" className="mb-8">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2
              id="stats-heading"
              className="text-xs font-bold uppercase tracking-[0.1em] text-navy-400"
            >
              Overview
            </h2>
            <p className="text-xs text-navy-400">Last 24 hours · updated just now</p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {DASHBOARD_STATS.map((stat, i) => (
              <StatCard key={stat.id} stat={stat} index={i} />
            ))}
          </div>
        </section>

        {/* ================= Main grid ================= */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* ---- Active requests ---- */}
          <section aria-labelledby="active-heading" className="lg:col-span-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <h2
                  id="active-heading"
                  className="text-lg font-extrabold tracking-tight text-navy-900"
                >
                  Active requests
                </h2>
                <Badge tone="navy" size="sm">
                  {active.length}
                </Badge>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/reports">
                  View all reports
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>

            {active.length === 0 ? (
              <EmptyState />
            ) : (
              <ul className="space-y-3.5">
                {active.slice(0, 5).map((report) => (
                  <li key={report.id}>
                    <ReportCard report={report} />
                  </li>
                ))}
              </ul>
            )}

            {active.length > 5 && (
              <div className="mt-4">
                <Button asChild variant="outline" size="lg" block>
                  <Link href="/reports">
                    Show {active.length - 5} more active request
                    {active.length - 5 === 1 ? '' : 's'}
                    <ChevronRight aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            )}
          </section>

          {/* ---- Right rail ---- */}
          <aside className="space-y-6 lg:col-span-4">
            {/* Triage feed */}
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-navy-100 bg-navy-50/60 px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-bold text-navy-900">
                  <span className="grid size-7 place-items-center rounded-lg bg-dispatch-50 text-dispatch-700 ring-1 ring-inset ring-dispatch-200">
                    <Brain className="size-3.5" aria-hidden="true" />
                  </span>
                  AI triage feed
                </h3>
                <LiveDot className="text-relief-600" label="Live" />
              </div>

              <ol className="divide-y divide-navy-100">
                {TRIAGE_FEED.map((e) => {
                  const dept = DEPARTMENTS.find((d) => d.id === e.departmentId);
                  return (
                    <li key={e.id}>
                      <Link
                        href={`/reports/${e.reportId}`}
                        className="flex items-start gap-3 p-3.5 transition-colors duration-200 hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-dispatch-600"
                      >
                        <span className="nums mt-0.5 shrink-0 text-2xs font-bold text-navy-400">
                          {shortStamp(e.at)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold leading-snug text-navy-800">
                            {e.message}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-navy-400">
                            <span className="font-semibold text-navy-500">{dept?.shortName}</span>
                            <span className="nums">{Math.round(e.confidence * 100)}% sure</span>
                          </span>
                        </span>
                        <ChevronRight
                          className="mt-0.5 size-4 shrink-0 text-navy-300"
                          aria-hidden="true"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ol>

              <div className="border-t border-navy-100 bg-navy-50/50 px-4 py-2.5">
                <p className="text-2xs leading-relaxed text-navy-400">
                  A human confirms every request before dispatch. The AI only prepares it.
                </p>
              </div>
            </Card>

            {/* Response network */}
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-navy-100 px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-bold text-navy-900">
                  <span className="grid size-7 place-items-center rounded-lg bg-navy-100 text-navy-600">
                    <Building2 className="size-3.5" aria-hidden="true" />
                  </span>
                  Response network
                </h3>
                <span className="text-2xs font-semibold text-navy-400">
                  {DEPARTMENTS.length} departments
                </span>
              </div>

              <ul className="divide-y divide-navy-100">
                {DEPARTMENTS.map((dept) => {
                  const cfg = DEPARTMENT_STATUS_STYLES[dept.status];
                  const pct = Math.round((dept.crewsAvailable / dept.crewsTotal) * 100);
                  return (
                    <li key={dept.id} className="p-3.5">
                      <div className="flex items-center gap-3">
                        <span
                          className="grid size-9 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-600 ring-1 ring-inset ring-navy-200"
                          aria-hidden="true"
                        >
                          <dept.icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-navy-900">
                            {dept.shortName}
                          </p>
                          <p className="truncate text-2xs text-navy-400">{dept.coverage}</p>
                        </div>
                        <Badge
                          tone="outline"
                          size="xs"
                          className={cn('shrink-0', cfg.chip)}
                        >
                          <span className={cn('size-1.5 rounded-full', cfg.dot)} aria-hidden="true" />
                          {dept.statusLabel}
                        </Badge>
                      </div>

                      <div className="mt-2.5 flex items-center gap-2.5">
                        <div
                          className="h-1.5 flex-1 overflow-hidden rounded-full bg-navy-100"
                          role="img"
                          aria-label={`${dept.crewsAvailable} of ${dept.crewsTotal} crews available`}
                        >
                          <div
                            className={cn('h-full rounded-full', cfg.dot)}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="nums shrink-0 text-2xs font-bold text-navy-500">
                          {dept.crewsAvailable}/{dept.crewsTotal}
                        </span>
                        <span className="nums shrink-0 text-2xs text-navy-400">
                          ~{dept.avgResponseMinutes}m
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>

            {/* Recently resolved */}
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-navy-100 px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-bold text-navy-900">
                  <span className="grid size-7 place-items-center rounded-lg bg-relief-50 text-relief-700 ring-1 ring-inset ring-relief-200">
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  </span>
                  Recently resolved
                </h3>
                <Badge tone="quiet" size="xs">
                  {resolved.length}
                </Badge>
              </div>
              {resolved.length > 0 ? (
                <ul className="p-1.5">
                  {resolved.slice(0, 3).map((r) => (
                    <ReportRow key={r.id} report={r} />
                  ))}
                </ul>
              ) : (
                <p className="p-4 text-sm text-navy-500">Nothing resolved yet today.</p>
              )}
            </Card>
          </aside>
        </div>

        {/* ================= Category shortcuts ================= */}
        <section aria-labelledby="cat-heading" className="mt-10">
          <h2
            id="cat-heading"
            className="text-xs font-bold uppercase tracking-[0.1em] text-navy-400"
          >
            I need help with
          </h2>
          <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
            {Object.values(CATEGORIES).map((cat) => {
              const Icon = CATEGORY_ICONS[cat.id];
              return (
                <Button
                  key={cat.id}
                  asChild
                  variant="outline"
                  className="h-auto min-w-0 flex-col items-start gap-2 whitespace-normal p-3.5 text-left"
                >
                  <Link href={`/chat?intent=${cat.id}`}>
                    <span
                      className={cn(
                        'grid size-9 place-items-center rounded-lg ring-1 ring-inset',
                        cat.chip,
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold leading-tight text-navy-900">
                        {cat.shortLabel}
                      </span>
                      <span className="mt-0.5 block text-2xs font-normal leading-snug text-navy-400">
                        {cat.description.split(',')[0]}
                      </span>
                    </span>
                  </Link>
                </Button>
              );
            })}
          </div>
        </section>

        {/* ================= Relief mode explainer ================= */}
        <section className="mt-10" aria-labelledby="mode-heading">
          <Card className="overflow-hidden">
            <div className="grid gap-0 md:grid-cols-3">
              {[
                {
                  icon: Siren,
                  title: 'One tap to SOS',
                  body: 'The crimson button is on every screen. It shares your live location with the nearest crew — no typing, no forms.',
                  cta: { label: 'Open SOS', href: '/dashboard' },
                },
                {
                  icon: Brain,
                  title: 'AI drafts, you confirm',
                  body: 'Describe what is happening in your own words. FLARE extracts the details and shows you exactly what will be sent.',
                  cta: { label: 'Try the assistant', href: '/chat' },
                },
                {
                  icon: Activity,
                  title: 'Track it live',
                  body: 'Watch each request move from submitted to resolved, with the responder, their ETA and every update logged.',
                  cta: { label: 'View reports', href: '/reports' },
                },
              ].map((f, i) => (
                <div
                  key={f.title}
                  className={cn(
                    'p-5 sm:p-6',
                    i > 0 && 'border-t border-navy-100 md:border-l md:border-t-0',
                  )}
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-navy-900 text-white">
                    <f.icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3
                    id={i === 0 ? 'mode-heading' : undefined}
                    className="mt-3.5 text-sm font-bold text-navy-900"
                  >
                    {f.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-navy-500">{f.body}</p>
                  <Button asChild variant="link" size="sm" className="mt-2 px-0">
                    <Link href={f.cta.href}>
                      {f.cta.label}
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="px-6 py-12 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-relief-50 text-relief-600 ring-1 ring-inset ring-relief-200">
        <CheckCircle2 className="size-7" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-base font-bold text-navy-900">No open requests</h3>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-navy-500">
        Everything you have reported has been resolved. If your situation changes, the assistant is
        one tap away — by voice or text.
      </p>
      <Button asChild variant="primary" size="lg" className="mt-5">
        <Link href="/chat">
          <Mic aria-hidden="true" />
          Talk to the assistant
        </Link>
      </Button>
    </Card>
  );
}
