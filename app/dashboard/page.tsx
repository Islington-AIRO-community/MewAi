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
  Shield,
  Siren,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
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
  type Report,
} from '@/lib/types';
import { useApp, type SessionUser } from '@/lib/store';
import { greetingKeyFor } from '@/lib/time';
import { cn, formatNumber, shortStamp } from '@/lib/utils';
import { Eyebrow } from '@/components/ui/primitives';
import { StateCard } from '@/components/ui/patterns';
import { useLocale } from '@/lib/i18n';

const QUICK_ACTIONS = [
  {
    id: 'voice',
    href: '/chat',
    label: 'Report by voice',
    hint: 'Hands-free, no typing',
    icon: Mic,
    tone: 'bg-navy-900 text-white',
  },
  {
    id: 'text',
    href: '/chat',
    label: 'Describe in text',
    hint: 'AI routes it for you',
    icon: Brain,
    tone: 'bg-white text-navy-800',
  },
  {
    id: 'shelter',
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
  security: Shield,
} as const;

/** The three-step promise the explainer card makes. */
const RELIEF_MODE_FLOW = [
  {
    id: 'sos',
    icon: Siren,
    title: 'One tap to SOS',
    body: 'The crimson button is on every screen. It shares your live location with the nearest crew — no typing, no forms.',
    cta: { label: 'Open SOS', href: '/dashboard' },
  },
  {
    id: 'draft',
    icon: Brain,
    title: 'AI drafts, you confirm',
    body: 'Describe what is happening in your own words. FLARE extracts the details and shows you exactly what will be sent.',
    cta: { label: 'Try the assistant', href: '/chat' },
  },
  {
    id: 'track',
    icon: Activity,
    title: 'Track it live',
    body: 'Watch each request move from submitted to resolved, with the responder, their ETA and every update logged.',
    cta: { label: 'View reports', href: '/reports' },
  },
] as const;

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
  const greetingKey = React.useMemo(() => greetingKeyFor(), []);

  return (
    <div className="pb-[var(--content-bottom)] sm:pb-16">
      <Hero greetingKey={greetingKey} user={user} active={active} critical={critical} />

      <div className="container py-7 sm:py-9">
        <OverviewStats />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <ActiveRequests active={active} />
          <RightRail resolved={resolved} />
        </div>

        <CategoryShortcuts />
        <ReliefModeExplainer />
      </div>
    </div>
  );
}

/**
 * The greeting, the live system state, and the three things worth doing next.
 *
 * Takes the derived lists rather than counts so the sentence that counts them
 * stays next to the badge that repeats them — when "including N critical" is
 * added to that line, the number it uses cannot drift from the one in the rail.
 */
function Hero({
  greetingKey,
  user,
  active,
  critical,
}: {
  greetingKey: string;
  user: SessionUser | null;
  active: Report[];
  critical: Report[];
}) {
  const { t } = useLocale();
  return (
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
              <Eyebrow as="span" className="flex items-center gap-1.5 text-white/45">
                <LiveDot
                  className="text-relief-400"
                  label={t('status.activeCount', {
                    n: formatNumber(SYSTEM_STATUS.activeResponders),
                  })}
                />
              </Eyebrow>
            </div>

            <h1 className="mt-4 text-balance text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-3xl">
              {t(greetingKey)}
              {user ? `, ${user.name.split(' ')[0]}` : ''}.{' '}
              {t('dashboard.greetingTail')}
            </h1>

            <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-white/60 sm:text-base">
              {active.length === 0
                ? t('dashboard.hero.calm')
                : t(active.length === 1 ? 'dashboard.hero.open' : 'dashboard.hero.openPlural', {
                    n: active.length,
                  }) +
                  (critical.length > 0
                    ? t('dashboard.hero.critical', { n: critical.length })
                    : '') +
                  t('dashboard.hero.updates')}
            </p>
          </div>

          {/* Quick actions */}
          <div className="grid shrink-0 grid-cols-1 gap-2.5 sm:grid-cols-3 lg:w-[30rem]">
            {QUICK_ACTIONS.map((a) => (
              <Button
                key={a.id}
                asChild
                variant={a.tone.includes('navy-900') ? 'white' : 'outline'}
                size="lg"
                className={cn(
                  'justify-start gap-3 text-left',
                  !a.tone.includes('navy-900') && 'bg-white/95',
                )}
              >
                <Link href={a.href}>
                  <a.icon className="size-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">
                      {t(`dashboard.quick.${a.id}.label`)}
                    </span>
                    <span
                      className={cn(
                        'block truncate text-2xs font-medium',
                        a.tone.includes('navy-900') ? 'text-navy-500' : 'text-navy-400',
                      )}
                    >
                      {t(`dashboard.quick.${a.id}.hint`)}
                    </span>
                  </span>
                </Link>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function OverviewStats() {
  const { t } = useLocale();
  return (
    <section aria-labelledby="stats-heading" className="mb-8">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <Eyebrow as="h2" id="stats-heading" className="text-navy-400">
          {t('dashboard.overview')}
        </Eyebrow>
        <p className="text-xs text-navy-400">{t('dashboard.overviewWindow')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {DASHBOARD_STATS.map((stat, i) => (
          <StatCard key={stat.id} stat={stat} index={i} />
        ))}
      </div>
    </section>
  );
}

/**
 * The five most recent open requests, and a way to the rest.
 *
 * The cap is a dashboard decision, not a pagination one: `/reports` holds the
 * full set with filters, and re-implementing paging here would mean two places
 * to fix when a report shape changes. So this truncates and links.
 */
function ActiveRequests({ active }: { active: Report[] }) {
  const { t } = useLocale();
  const hidden = Math.max(0, active.length - 5);

  return (
    <section aria-labelledby="active-heading" className="lg:col-span-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 id="active-heading" className="text-lg font-extrabold tracking-tight text-navy-900">
            {t('dashboard.activeRequests')}
          </h2>
          <Badge tone="navy" size="sm">
            {active.length}
          </Badge>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/reports">
            {t('reports.viewAll')}
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

      {hidden > 0 && (
        <div className="mt-4">
          <Button asChild variant="outline" size="lg" block>
            <Link href="/reports">
              {t(hidden === 1 ? 'dashboard.showMore' : 'dashboard.showMorePlural', {
                n: hidden,
              })}
              <ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}
    </section>
  );
}

function RightRail({ resolved }: { resolved: Report[] }) {
  const { t, label } = useLocale();
  return (
    <aside className="space-y-6 lg:col-span-4">
      {/* Triage feed */}
      <Card className="overflow-hidden">
        <CardHeader
          className="bg-navy-50/60"
          icon={
            <span
              className="grid size-7 place-items-center rounded-lg bg-dispatch-50 text-dispatch-700 ring-1 ring-inset ring-dispatch-200"
              aria-hidden="true"
            >
              <Brain className="size-3.5" />
            </span>
          }
          actions={<LiveDot className="text-relief-600" label={t('status.live')} />}
        >
          <CardTitle>{t('dashboard.triageFeed')}</CardTitle>
        </CardHeader>

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
                    {/* The message is demo data, not chrome: the triage feed is a
                        transcript of what the classifier said, so it stays as
                        written rather than being re-worded per locale. */}
                    <span className="block text-sm font-semibold leading-snug text-navy-800">
                      {e.message}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-navy-400">
                      <span className="font-semibold text-navy-500">
                        {dept ? label('departmentShort', dept.id, dept.shortName) : null}
                      </span>
                      <span className="nums">
                        {t('dashboard.sure', { n: Math.round(e.confidence * 100) })}
                      </span>
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
            {t('dashboard.triageDisclaimer')}
          </p>
        </div>
      </Card>

      {/* Response network */}
      <Card className="overflow-hidden">
        <CardHeader
          icon={
            <span
              className="grid size-7 place-items-center rounded-lg bg-navy-100 text-navy-600"
              aria-hidden="true"
            >
              <Building2 className="size-3.5" />
            </span>
          }
          actions={
            <span className="text-2xs font-semibold text-navy-400">
              {t('dashboard.departments', { n: DEPARTMENTS.length })}
            </span>
          }
        >
          <CardTitle>{t('dashboard.network')}</CardTitle>
        </CardHeader>

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
                      {label('departmentShort', dept.id, dept.shortName)}
                    </p>
                    <p className="truncate text-2xs text-navy-400">
                      {label('coverage', dept.id, dept.coverage)}
                    </p>
                  </div>
                  <Badge tone="outline" size="xs" className={cn('shrink-0', cfg.chip)}>
                    <span className={cn('size-1.5 rounded-full', cfg.dot)} aria-hidden="true" />
                    {label('status', dept.status, dept.statusLabel)}
                  </Badge>
                </div>

                <div className="mt-2.5 flex items-center gap-2.5">
                  <div
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-navy-100"
                    role="img"
                    aria-label={t('dashboard.crewsAvailable', {
                      available: dept.crewsAvailable,
                      total: dept.crewsTotal,
                    })}
                  >
                    <div className={cn('h-full rounded-full', cfg.dot)} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="nums shrink-0 text-2xs font-bold text-navy-500">
                    {dept.crewsAvailable}/{dept.crewsTotal}
                  </span>
                  <span className="nums shrink-0 text-2xs text-navy-400">
                    {t('dashboard.minutesShort', { n: dept.avgResponseMinutes })}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Recently resolved */}
      <Card className="overflow-hidden">
        <CardHeader
          icon={
            <span
              className="grid size-7 place-items-center rounded-lg bg-relief-50 text-relief-700 ring-1 ring-inset ring-relief-200"
              aria-hidden="true"
            >
              <CheckCircle2 className="size-3.5" />
            </span>
          }
          actions={
            <Badge tone="quiet" size="xs">
              {resolved.length}
            </Badge>
          }
        >
          <CardTitle>{t('dashboard.recentlyResolved')}</CardTitle>
        </CardHeader>
        {resolved.length > 0 ? (
          <ul className="p-1.5">
            {resolved.slice(0, 3).map((r) => (
              <ReportRow key={r.id} report={r} />
            ))}
          </ul>
        ) : (
          <p className="p-4 text-sm text-navy-500">{t('dashboard.nothingResolved')}</p>
        )}
      </Card>
    </aside>
  );
}

/**
 * The eight category shortcuts into the assistant.
 *
 * Each one is a pre-filled `?intent=`, so this is a shortcut rather than a
 * filter — the assistant still asks its own questions.
 *
 * Column counts must divide `CATEGORIES` (8) evenly at every breakpoint. 7 left
 * an orphan tile on its own row once `security` was added; 2, 4 and 8 all divide
 * 8, so no width produces a gap. Recheck this before anything else if a category
 * is added or removed.
 */
function CategoryShortcuts() {
  const { t, label } = useLocale();
  return (
    <section aria-labelledby="cat-heading" className="mt-10">
      <Eyebrow as="h2" id="cat-heading" className="text-navy-400">
        {t('dashboard.needHelpWith')}
      </Eyebrow>
      <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-8">
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
                  className={cn('grid size-9 place-items-center rounded-lg ring-1 ring-inset', cat.chip)}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold leading-tight text-navy-900">
                    {label('category', cat.id, cat.shortLabel)}
                  </span>
                  <span className="mt-0.5 block text-2xs font-normal leading-snug text-navy-400">
                    {/* The English hint is the first clause of `description`; the
                        Nepali one is written to fit the same narrow slot. */}
                    {label('categoryHint', cat.id, cat.description.split(',')[0])}
                  </span>
                </span>
              </Link>
            </Button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The three promises, side by side.
 *
 * `aria-labelledby` points at the *first* column's heading, which is a slightly
 * awkward arrangement — a three-column group has no single heading of its own —
 * but it is the only one of the three that keeps the document outline intact,
 * since promoting a wrapper to a heading would need a level nothing else here
 * has.
 */
function ReliefModeExplainer() {
  const { t } = useLocale();
  return (
    <section className="mt-10" aria-labelledby="mode-heading">
      <Card className="overflow-hidden">
        <div className="grid gap-0 md:grid-cols-3">
          {RELIEF_MODE_FLOW.map((f, i) => (
            <div
              key={f.id}
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
                {t(`dashboard.flow.${f.id}.title`)}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-navy-500">{f.body}</p>
              <Button asChild variant="link" size="sm" className="mt-2 px-0">
                <Link href={f.cta.href}>
                  {t(`dashboard.flow.${f.id}.cta`)}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

function EmptyState() {
  const { t } = useLocale();
  return (
    <StateCard
      icon={CheckCircle2}
      tone="relief"
      titleAs="h3"
      title={t('dashboard.empty.title')}
      action={
        <Button asChild variant="primary" size="lg">
          <Link href="/chat">
            <Mic aria-hidden="true" />
            {t('landing.hero.ctaChat')}
          </Link>
        </Button>
      }
    >
      {t('dashboard.empty.body')}
    </StateCard>
  );
}
