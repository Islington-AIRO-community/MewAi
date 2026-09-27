'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Accessibility,
  AlertTriangle,
  ArrowLeft,
  Baby,
  Bot,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Copy,
  Crosshair,
  Download,
  FileText,
  HeartPulse,
  Info,
  Link2,
  Mail,
  MapPin,
  MessageSquareText,
  Navigation,
  Phone,
  Printer,
  Radio,
  Share2,
  Sparkles,
  UserRound,
  Users,
  Waves,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardSection,
} from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/primitives';

import { ProgressStepper } from '@/components/reports/progress-stepper';
import { PriorityBadge, LiveDot } from '@/components/reports/badges';
import { useApp } from '@/lib/store';
import { useToast } from '@/components/ui/toast';
import {
  CATEGORIES,
  DEPARTMENT_STATUS_STYLES,
  PRIORITIES,
  STAGES,
  getDepartment,
  type Priority,
  type Report,
} from '@/lib/types';
import { cn, formatNumber, fullStamp, reportCodeFromId, shortStamp } from '@/lib/utils';
import { useLocale } from '@/lib/i18n';

/**
 * The priority ramp, most urgent first — the order the scale bar in the sidebar
 * reads left to right. Hoisted because that bar used to repeat this literal
 * three times, once per opacity branch.
 */
const PRIORITY_SCALE: readonly Priority[] = ['critical', 'high', 'medium', 'low'];

/* ------------------------------------------------------------------ *
 * Static map placeholder.
 * A real deployment swaps this for a tile layer; the pin, the geofence
 * and the labels stay identical, so the affordance is not lost.
 * ------------------------------------------------------------------ */

function LocationMap({
  label,
  area,
  landmark,
  critical,
}: {
  label: string;
  area: string;
  landmark: string;
  critical: boolean;
}) {
  const { t } = useLocale();
  return (
    <div className="relative overflow-hidden rounded-xl border border-navy-200 bg-navy-50">
      <div className="absolute inset-0 surface-grid opacity-70" aria-hidden="true" />

      {/* Stylised roads */}
      <svg
        viewBox="0 0 400 200"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M0 60 H400" stroke="#CBD5E1" strokeWidth="7" />
        <path d="M0 140 H400" stroke="#CBD5E1" strokeWidth="4" />
        <path d="M120 0 V200" stroke="#CBD5E1" strokeWidth="5" />
        <path d="M280 0 V200" stroke="#E2E8F0" strokeWidth="9" />
        <path d="M0 170 H400" stroke="#E2E8F0" strokeWidth="3" strokeDasharray="8 8" />
      </svg>

      {/* Radius halo */}
      <div
        className={cn(
          'absolute left-1/2 top-1/2 size-28 -translate-x-1/2 -translate-y-1/2 rounded-full',
          critical ? 'bg-emergency-500/15' : 'bg-dispatch-500/15',
        )}
        aria-hidden="true"
      />

      {/* Pin */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
        <motion.span
          initial={{ scale: 0, y: -8 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="relative block"
        >
          <span
            className={cn(
              'grid size-9 place-items-center rounded-full rounded-br-sm text-white shadow-lift ring-[3px] ring-white',
              critical ? 'bg-emergency-500' : 'bg-navy-900',
            )}
            style={{ transform: 'rotate(-45deg)' }}
          >
            <Crosshair
              className="size-4"
              style={{ transform: 'rotate(45deg)' }}
              aria-hidden="true"
            />
          </span>
        </motion.span>
      </div>

      {/* Label card */}
      <div className="absolute inset-x-0 bottom-0 p-2.5">
        <div className="rounded-lg bg-white/95 p-2.5 shadow-soft backdrop-blur">
          <p className="truncate text-xs font-bold text-navy-900">{label}</p>
          <p className="truncate text-2xs text-navy-500">{landmark}</p>
        </div>
      </div>

      <span className="sr-only">{t('detail.mapAlt', { label, area })}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Timeline
 * ------------------------------------------------------------------ */

function EventLog({ reportId }: { reportId: string }) {
  const { getReport } = useApp();
  const report = getReport(reportId);
  if (!report) return null;

  return (
    <ol className="relative space-y-0">
      {report.timeline.map((e, i) => {
        const isLast = i === report.timeline.length - 1;
        const actorTone =
          e.actorRole === 'system'
            ? 'bg-dispatch-50 text-dispatch-700 ring-dispatch-200'
            : e.actorRole === 'reporter'
              ? 'bg-navy-100 text-navy-700 ring-navy-200'
              : e.actorRole === 'responder'
                ? 'bg-relief-50 text-relief-700 ring-relief-200'
                : 'bg-alert-50 text-alert-800 ring-alert-200';

        return (
          <li key={e.id} className="relative flex gap-3.5 pb-5 last:pb-0">
            {!isLast && (
              <span
                className="absolute left-[15px] top-9 h-[calc(100%-1.5rem)] w-0.5 bg-navy-100"
                aria-hidden="true"
              />
            )}
            <span
              className={cn(
                'relative z-10 grid size-8 shrink-0 place-items-center rounded-full ring-1 ring-inset',
                actorTone,
              )}
              aria-hidden="true"
            >
              {e.actorRole === 'system' ? (
                <Bot className="size-4" />
              ) : e.actorRole === 'reporter' ? (
                <UserRound className="size-4" />
              ) : e.actorRole === 'responder' ? (
                <Radio className="size-4" />
              ) : (
                <Building2 className="size-4" />
              )}
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="text-sm font-bold leading-snug text-navy-900">{e.title}</p>
                <time
                  dateTime={e.at}
                  className="nums shrink-0 text-2xs font-semibold text-navy-400"
                >
                  {shortStamp(e.at)}
                </time>
              </div>
              <p className="mt-0.5 text-sm leading-relaxed text-navy-600">{e.detail}</p>

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-2xs text-navy-400">
                  <span className="font-semibold text-navy-500">{e.actor}</span>
                  <span className="sr-only">, </span>
                </span>
                {e.tags?.map((t) => (
                  <Badge
                    key={t}
                    tone="outline"
                    size="xs"
                    className="bg-navy-50 font-semibold text-navy-600 ring-navy-200"
                  >
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const reportId = String(params?.id ?? '');
  const { getReport } = useApp();
  const report = getReport(reportId);

  // Not `notFound()`: this is a client component, so it cannot. The route is
  // also reachable with a stale id after a refresh, because the store is
  // in-memory only (see lib/store.tsx) — this is the expected outcome of a hard
  // reload on a report URL, not a bug.
  if (!report) {
    return <ReportNotFound reportId={reportId} />;
  }

  return <ReportView report={report} />;
}

function ReportNotFound({ reportId }: { reportId: string }) {
  const { t } = useLocale();
  return (
    <div className="container py-20">
      <div className="mx-auto max-w-md text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-navy-100 text-navy-500">
          <FileText className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-extrabold text-navy-900">{t('detail.notFound.title')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-navy-500">
          {t('detail.notFound.body', { code: reportCodeFromId(reportId) })}
        </p>
        <Button asChild variant="primary" size="lg" className="mt-6">
          <Link href="/reports">
            <ArrowLeft aria-hidden="true" />
            {t('detail.notFound.cta')}
          </Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * The report itself.
 *
 * Split from `ReportDetailPage` so this component only ever sees a report that
 * exists. That is what lets the derived values and the clipboard handlers below
 * be plain consts instead of a hook called after an early return — the reason
 * the previous version had to hand-roll everything inline.
 */
function ReportView({ report }: { report: Report }) {
  const { advanceStage } = useApp();
  const { toast } = useToast();
  const { t } = useLocale();

  const code = reportCodeFromId(report.id);
  const stageIndex = STAGES.findIndex((s) => s.id === report.currentStage);
  const resolved = report.currentStage === 'resolved';

  /**
   * The single clipboard path for this page.
   *
   * The two share controls used to fire a toast and copy nothing, which told a
   * responder in the field that a link was on their clipboard when it was not.
   * Anything that claims to have copied must go through here.
   */
  const copy = (text: string, title: string) => {
    navigator.clipboard?.writeText(text).then(
      () => toast({ tone: 'success', title, description: text }),
      () => toast({ tone: 'alert', title: t('detail.copy.failed'), description: text }),
    );
  };

  const onCopy = () => {
    copy(`${code} — ${report.title} (${report.location.label})`, t('detail.copy.copied'));
  };

  const onCopyLink = () => {
    copy(
      typeof window === 'undefined' ? code : `${window.location.origin}/reports/${report.id}`,
      t('detail.copy.link'),
    );
  };

  const onCopyPin = () => {
    copy(
      `${report.location.label} — ${report.location.lat.toFixed(5)}, ${report.location.lng.toFixed(5)}`,
      t('detail.copy.location'),
    );
  };

  const onAdvance = () => {
    advanceStage(report.id);
    toast({
      tone: 'info',
      title: t('detail.advance.title'),
      description: t('detail.advance.body'),
    });
  };

  return (
    <div className="pb-[var(--content-bottom)] sm:pb-16">
      <ReportHeader
        report={report}
        code={code}
        stageIndex={stageIndex}
        resolved={resolved}
        onCopy={onCopy}
        onCopyLink={onCopyLink}
      />

      <div className="container py-7 sm:py-9">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* ============ Main column ============ */}
          <div className="space-y-6 lg:col-span-8">
            <ProgressCard
              report={report}
              stageIndex={stageIndex}
              resolved={resolved}
              onAdvance={onAdvance}
            />
            <EventLogCard report={report} />
            <ExtractedCard report={report} />
          </div>

          {/* ============ Sidebar ============ */}
          <aside className="space-y-6 lg:col-span-4">
            <ClassificationCard report={report} />
            <LocationCard report={report} onCopyPin={onCopyPin} />
            <AssignedResponseCard report={report} />
            <ContactPreferenceCard report={report} />
          </aside>
        </div>

        <ImpactSection report={report} />
        <FooterActions />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Header
 * ------------------------------------------------------------------ */

/**
 * The dark banner: what this report is, how urgent it is, and the four things
 * you can do to it.
 *
 * `stageIndex` and `resolved` are threaded down from `ReportView` rather than
 * recomputed here so the "Resolved" badge in the header and the "Completed"
 * badge in the stepper below can never disagree about the stage.
 */
function ReportHeader({
  report,
  code,
  stageIndex,
  resolved,
  onCopy,
  onCopyLink,
}: {
  report: Report;
  code: string;
  stageIndex: number;
  resolved: boolean;
  onCopy: () => void;
  onCopyLink: () => void;
}) {
  const { toast } = useToast();
  const { t, label } = useLocale();

  return (
    <div className="relative overflow-hidden border-b border-navy-800 bg-navy-900">
      {report.priority === 'critical' && !resolved && (
        <div
          className="pointer-events-none absolute inset-0 stripe-critical opacity-40"
          aria-hidden="true"
        />
      )}
      <div
        className="pointer-events-none absolute inset-0 surface-grid-dark opacity-30"
        aria-hidden="true"
      />

      <div className="container relative py-6 sm:py-8">
        <Link
          href="/reports"
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg pr-2 text-sm font-semibold text-white/70 no-tap-highlight transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t('reports.title')}
        </Link>

        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="nums rounded-lg bg-white/10 px-2 py-1 text-xs font-bold tracking-tight text-white ring-1 ring-inset ring-white/15">
                {code}
              </span>
              <PriorityBadge priority={report.priority} size="sm" />
              {resolved ? (
                <Badge tone="reliefSolid" size="sm">
                  <CheckCircle2 className="size-3" aria-hidden="true" />
                  {t('reports.resolved')}
                </Badge>
              ) : (
                <Badge tone="glass" size="sm">
                  <LiveDot
                    className="text-relief-400"
                    label={label('stageShort', report.currentStage, STAGES[stageIndex].short)}
                  />
                </Badge>
              )}
              <Eyebrow as="span" className="text-white/40">
                {t(`detail.channel.${report.channel}`)}
              </Eyebrow>
            </div>

            <h1 className="mt-3 text-balance text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-3xl">
              {report.title}
            </h1>

            <p className="mt-2.5 max-w-2xl text-pretty text-sm leading-relaxed text-white/70 sm:text-base">
              {report.summary}
            </p>

            {/* `data-no-translate`: the reporter's name is identifying data, and
                the counts beside it are the facts a crew is dispatched against.
                The summary above is prose and *is* translated — that is the
                point of the second layer. */}
            <dl
              className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/60"
              data-no-translate
            >
              <div className="flex items-center gap-1.5">
                <Clock3 className="size-4 shrink-0 text-white/40" aria-hidden="true" />
                <dt className="sr-only">{t('detail.submitted')}</dt>
                <dd className="nums font-semibold">{fullStamp(report.createdAt)}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <UserRound className="size-4 shrink-0 text-white/40" aria-hidden="true" />
                <dt className="sr-only">{t('detail.reporter')}</dt>
                <dd className="font-semibold">{report.reporterName}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <Navigation className="size-4 shrink-0 text-white/40" aria-hidden="true" />
                <dt className="sr-only">{t('detail.peopleAffected')}</dt>
                <dd className="nums font-semibold">
                  {t('detail.affected', { n: formatNumber(report.peopleAffected) })}
                </dd>
              </div>
            </dl>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 flex-col gap-2.5 sm:flex-row lg:flex-col">
            <Button
              variant="sos"
              size="lg"
              className="stripe-critical"
              onClick={() =>
                toast({
                  tone: 'critical',
                  title: t('detail.contactResponder.title'),
                  description: t('detail.contactResponder.body'),
                })
              }
            >
              <Phone aria-hidden="true" />
              {t('detail.contactResponder.cta')}
            </Button>
            <div className="flex gap-2.5">
              <Button
                variant="outlineNavy"
                size="lg"
                onClick={onCopy}
                className="flex-1 lg:flex-none"
              >
                <Copy aria-hidden="true" />
                {t('detail.copyId')}
              </Button>
              <Button
                variant="outlineNavy"
                size="icon"
                onClick={() => window.print()}
                srLabel={t('detail.print')}
              >
                <Printer aria-hidden="true" />
              </Button>
              <Button
                variant="outlineNavy"
                size="icon"
                onClick={onCopyLink}
                srLabel={t('detail.share')}
              >
                <Share2 aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Main column
 * ------------------------------------------------------------------ */

/**
 * The stage stepper, the target it is being held to, and the demo control that
 * advances it.
 *
 * The SLA figure is derived here rather than in `ReportView` so the parent only
 * has to compose: the two readers of the priority ramp are this card and
 * `ClassificationCard`, and neither is the page's business.
 */
function ProgressCard({
  report,
  stageIndex,
  resolved,
  onAdvance,
}: {
  report: Report;
  stageIndex: number;
  resolved: boolean;
  onAdvance: () => void;
}) {
  const { t } = useLocale();
  const priority = PRIORITIES[report.priority];
  const openSla =
    priority.slaMinutes >= 1440 ? '24h' : t('detail.minutes', { n: priority.slaMinutes });

  return (
    <Card className="overflow-hidden">
      <CardHeader
        actions={
          <>
            {!resolved && (
              <Badge tone="alert" size="sm">
                <Clock3 className="size-3" aria-hidden="true" />
                {t('detail.target', { sla: openSla })}
              </Badge>
            )}
            {resolved ? (
              <Badge tone="relief" size="sm">
                <CheckCircle2 className="size-3" aria-hidden="true" />
                {t('detail.completed')}
              </Badge>
            ) : (
              <LiveDot className="text-relief-600" label={t('detail.tracking')} />
            )}
          </>
        }
      >
        <CardTitle titleAs="h2">{t('detail.progress.title')}</CardTitle>
        <CardDescription>
          {t('detail.progress.step', { n: stageIndex + 1, total: STAGES.length })} ·{' '}
          {STAGES[stageIndex].description}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ProgressStepper
          currentStage={report.currentStage}
          stageTimestamps={report.stageTimestamps}
          size="lg"
          detailed
        />
      </CardContent>

      {!resolved && (
        <CardFooter>
          <p className="min-w-0 flex-1 text-xs text-navy-500">
            {t('detail.progress.demoControl')}
          </p>
          <Button variant="outline" size="sm" onClick={onAdvance}>
            <Radio aria-hidden="true" />
            {t('detail.progress.simulate')}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

function EventLogCard({ report }: { report: Report }) {
  const { t } = useLocale();
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<ClipboardList className="size-4.5 shrink-0 text-navy-400" aria-hidden="true" />}
        actions={
          <span className="nums text-xs font-semibold text-navy-400">
            {t('detail.eventLog.entries', { n: report.timeline.length })}
          </span>
        }
      >
        <CardTitle titleAs="h2">{t('detail.eventLog.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <EventLog reportId={report.id} />
      </CardContent>
    </Card>
  );
}

/**
 * What the assistant read out of the conversation, each with the confidence it
 * had — so a misread is visible rather than silently dispatched.
 *
 * Renders nothing when the report has no extracted fields. An empty "Extracted
 * by FLARE" card is a worse answer than no card.
 */
function ExtractedCard({ report }: { report: Report }) {
  const { t } = useLocale();
  if (report.extracted.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        className="bg-dispatch-50/50"
        icon={
          <span
            className="grid size-7 shrink-0 place-items-center rounded-lg bg-dispatch-100 text-dispatch-700"
            aria-hidden="true"
          >
            <Sparkles className="size-3.5" />
          </span>
        }
        actions={
          <Badge tone="dispatch" size="sm">
            {t('detail.extracted.badge')}
          </Badge>
        }
      >
        <CardTitle titleAs="h2">{t('detail.extracted.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-xs leading-relaxed text-navy-500">{t('detail.extracted.body')}</p>
        <dl className="space-y-3">
          {report.extracted.map((x) => (
            <div key={x.label} className="rounded-xl border border-navy-200 bg-white p-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Eyebrow as="dt">{x.label}</Eyebrow>
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-16 overflow-hidden rounded-full bg-navy-100"
                    aria-hidden="true"
                  >
                    <span
                      className={cn(
                        'block h-full rounded-full',
                        x.confidence > 0.9
                          ? 'bg-relief-500'
                          : x.confidence > 0.75
                            ? 'bg-alert-500'
                            : 'bg-emergency-500',
                      )}
                      style={{ width: `${Math.round(x.confidence * 100)}%` }}
                    />
                  </span>
                  <span className="nums text-2xs font-bold text-navy-500">
                    {Math.round(x.confidence * 100)}%
                  </span>
                </span>
              </div>
              <dd className="mt-1 text-sm font-semibold leading-relaxed text-navy-800">
                {x.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Sidebar
 * ------------------------------------------------------------------ */

/**
 * What kind of report this is, how fast it is being handled, and what to watch
 * for — as three rule-separated strips in one card.
 *
 * The third strip used to open with a `<Separator>` and both later ones passed
 * `className="border-b-0"`, which meant the card rendered no rule between
 * Classification and Priority and a doubled one above the flags. The rule now
 * comes from `CardSection` alone: it draws a bottom border on every strip and
 * drops it on the last, so the conditional third strip needs no `Separator`
 * wrapped around it.
 */
function ClassificationCard({ report }: { report: Report }) {
  const { t, label } = useLocale();
  const category = CATEGORIES[report.category];
  const CategoryIcon = category.icon;
  const priority = PRIORITIES[report.priority];

  return (
    <Card className="overflow-hidden">
      <CardSection title={t('detail.classification.title')} titleAs="h2">
        <div className="mt-2.5 flex items-start gap-3">
          <span
            className={cn(
              'grid size-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset',
              category.chip,
            )}
            aria-hidden="true"
          >
            <CategoryIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-navy-900">
              {label('category', report.category, category.label)}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-navy-500">
              {category.description}
            </p>
          </div>
        </div>
      </CardSection>

      <CardSection title={t('reports.priority')} titleAs="h2">
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <PriorityBadge priority={report.priority} size="lg" showSla />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-navy-500">{priority.description}</p>

        {/* Priority scale */}
        <div className="mt-3 flex gap-1" aria-hidden="true">
          {PRIORITY_SCALE.map((p) => (
            <span
              key={p}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                PRIORITIES[p].bar,
                p === report.priority
                  ? 'opacity-100'
                  : PRIORITY_SCALE.indexOf(p) < PRIORITY_SCALE.indexOf(report.priority)
                    ? 'opacity-35'
                    : 'opacity-12',
              )}
            />
          ))}
        </div>
      </CardSection>

      {report.vulnerability.length > 0 && (
        <CardSection title={t('detail.flags.title')} titleAs="h2">
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {report.vulnerability.map((v) => (
              <li key={v}>
                <Badge
                  tone="outline"
                  size="sm"
                  className="bg-alert-50 font-semibold text-alert-800 ring-alert-200"
                >
                  <AlertTriangle className="size-3" aria-hidden="true" />
                  {v}
                </Badge>
              </li>
            ))}
          </ul>
        </CardSection>
      )}
    </Card>
  );
}

/** Where it is, and the two ways to get a responder to it. */
function LocationCard({
  report,
  onCopyPin,
}: {
  report: Report;
  onCopyPin: () => void;
}) {
  const { t } = useLocale();
  return (
    <Card className="overflow-hidden">
      <CardSection title={t('detail.location.title')} titleAs="h2" />
      <div className="p-4">
        <LocationMap
          label={report.location.label}
          area={report.location.area}
          landmark={report.location.landmark}
          critical={report.priority === 'critical'}
        />

        {/* `data-no-translate`: an address and an area name. A crew is dispatched
            to this text, and a model that re-renders it is a crew sent to the
            wrong street. The labels inside it are curated, but the block as a
            whole is the one place this page states where someone lives. */}
        <dl className="mt-3.5 space-y-2 text-sm" data-no-translate>
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-navy-400" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-2xs text-navy-400">{t('detail.location.address')}</dt>
              <dd className="font-semibold text-navy-800">{report.location.label}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Building2 className="mt-0.5 size-4 shrink-0 text-navy-400" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-2xs text-navy-400">{t('detail.location.area')}</dt>
              <dd className="font-semibold text-navy-800">{report.location.area}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Crosshair className="mt-0.5 size-4 shrink-0 text-navy-400" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-2xs text-navy-400">{t('detail.location.coords')}</dt>
              <dd className="nums font-semibold text-navy-800">
                {report.location.lat.toFixed(4)}, {report.location.lng.toFixed(4)}
              </dd>
            </div>
          </div>
        </dl>

        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm">
            <Navigation aria-hidden="true" />
            {t('btn.directions')}
          </Button>
          <Button variant="outline" size="sm" onClick={onCopyPin}>
            <Link2 aria-hidden="true" />
            {t('detail.sharePin')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** Which department owns this, how loaded they are, and who is already on the way. */
function AssignedResponseCard({ report }: { report: Report }) {
  const { t, label } = useLocale();
  const dept = getDepartment(report.departmentId);
  const DeptIcon = dept.icon;
  const statusCfg = DEPARTMENT_STATUS_STYLES[dept.status];

  return (
    <Card className="overflow-hidden">
      <CardSection title={t('detail.assigned.title')} titleAs="h2" />

      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy-900 text-white"
            aria-hidden="true"
          >
            <DeptIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-snug text-navy-900">
              {label('department', dept.id, dept.name)}
            </p>
            <p className="mt-0.5 text-xs text-navy-500">
              {label('coverage', dept.id, dept.coverage)}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone="outline" size="sm" className={statusCfg.chip}>
            <span className={cn('size-1.5 rounded-full', statusCfg.dot)} aria-hidden="true" />
            {label('status', dept.status, dept.statusLabel)}
          </Badge>
          <span className="nums text-2xs font-semibold text-navy-500">
            {t('detail.assigned.crews', {
              available: dept.crewsAvailable,
              total: dept.crewsTotal,
              n: dept.avgResponseMinutes,
            })}
          </span>
        </div>

        {report.responder && (
          <div className="mt-3.5 rounded-xl bg-relief-50 p-3.5 ring-1 ring-inset ring-relief-200">
            <Eyebrow className="text-relief-700">{t('detail.assigned.unit')}</Eyebrow>
            <p className="mt-1 text-sm font-bold text-navy-900">{report.responder.name}</p>
            <p className="text-xs text-navy-600">
              {report.responder.unit} · {report.responder.callSign}
            </p>
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {report.responder.certifications.map((c) => (
                <li key={c}>
                  <Badge
                    tone="outline"
                    size="xs"
                    className="bg-white font-semibold text-navy-600 ring-relief-200"
                  >
                    {c}
                  </Badge>
                </li>
              ))}
            </ul>
            {report.responder.etaMinutes ? (
              <div className="mt-3 flex items-center gap-2 border-t border-relief-200 pt-2.5">
                <Waves className="size-4 shrink-0 text-relief-600" aria-hidden="true" />
                <span className="text-sm font-bold text-navy-900">
                  {t('detail.assigned.eta', { n: report.responder.etaMinutes })}
                </span>
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <Button variant="primary" size="sm">
            <Phone aria-hidden="true" />
            {t('btn.callDesk')}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/chat">
              <MessageSquareText aria-hidden="true" />
              {t('sos.askAssistantShort')}
            </Link>
          </Button>
        </div>
        <p className="nums mt-2.5 text-center text-2xs text-navy-400">{dept.phone}</p>
      </div>
    </Card>
  );
}

/** What the reporter asked for, and how to change it. */
function ContactPreferenceCard({ report }: { report: Report }) {
  const { t } = useLocale();
  const icon =
    report.contactPreference === 'call' ? (
      <Phone className="size-4" aria-hidden="true" />
    ) : report.contactPreference === 'sms' ? (
      <MessageSquareText className="size-4" aria-hidden="true" />
    ) : (
      <Info className="size-4" aria-hidden="true" />
    );

  return (
    <Card className="p-5">
      <Eyebrow as="h2">{t('detail.contact.title')}</Eyebrow>
      <div className="mt-2.5 flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-navy-100 text-navy-700">
          {icon}
        </span>
        <p className="text-sm font-semibold text-navy-800">
          {report.contactPreference === 'none'
            ? t('detail.contact.none')
            : t(`detail.contact.${report.contactPreference}`)}
        </p>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-navy-500">{t('detail.contact.body')}</p>
      <Button variant="outline" size="sm" block className="mt-3">
        <Mail aria-hidden="true" />
        {t('detail.contact.cta')}
      </Button>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Foot
 * ------------------------------------------------------------------ */

/**
 * The headcount and the vulnerability flags, restated.
 *
 * Renders nothing for a one-person report: the header already says "1 affected",
 * and a card repeating it would be noise where someone is asking for help.
 */
function ImpactSection({ report }: { report: Report }) {
  const { t } = useLocale();
  if (report.peopleAffected <= 1) return null;

  return (
    <section className="mt-8" aria-labelledby="impact-heading">
      <Eyebrow as="h2" id="impact-heading">
        {t('detail.impact.title')}
      </Eyebrow>
      <Card className="mt-3 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-navy-100 text-navy-700">
            <Users className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="nums text-2xl font-extrabold leading-none text-navy-900">
              {formatNumber(report.peopleAffected)}
            </p>
            <p className="mt-1 text-sm text-navy-500">{t('detail.impact.counted')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {report.vulnerability.map((v) => (
              <Badge key={v} tone="outline" size="sm" className="bg-white ring-navy-200">
                {v.includes('child') || v.includes('infant') ? (
                  <Baby className="size-3" aria-hidden="true" />
                ) : v.includes('mobility') || v.includes('wheelchair') ? (
                  <Accessibility className="size-3" aria-hidden="true" />
                ) : (
                  <HeartPulse className="size-3" aria-hidden="true" />
                )}
                {v}
              </Badge>
            ))}
          </div>
        </div>
      </Card>
    </section>
  );
}

function FooterActions() {
  const { t } = useLocale();
  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
      <Button variant="outline" size="sm" onClick={() => window.print()}>
        <Download aria-hidden="true" />
        {t('detail.exportPdf')}
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link href="/reports">
          <ArrowLeft aria-hidden="true" />
          {t('detail.backToReports')}
        </Link>
      </Button>
    </div>
  );
}
