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
  Target,
  UserRound,
  Users,
  Waves,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator, Label } from '@/components/ui/primitives';
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
} from '@/lib/types';
import { cn, clockTime, formatNumber, fullStamp, reportCodeFromId, shortStamp } from '@/lib/utils';

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

      <span className="sr-only">
        Map showing {label} in {area}. Interactive map unavailable in this demo.
      </span>
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
                  {shortStamp(e.at)} · {clockTime(e.at)}
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
  const { getReport, advanceStage } = useApp();
  const { toast } = useToast();
  const report = getReport(reportId);

  if (!report) {
    return (
      <div className="container py-20">
        <div className="mx-auto max-w-md text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-navy-100 text-navy-500">
            <FileText className="size-7" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-xl font-extrabold text-navy-900">Report not found</h1>
          <p className="mt-2 text-sm leading-relaxed text-navy-500">
            We could not find a report with the ID{' '}
            <span className="nums font-bold">{reportCodeFromId(reportId)}</span>. It may belong to
            another account.
          </p>
          <Button asChild variant="primary" size="lg" className="mt-6">
            <Link href="/reports">
              <ArrowLeft aria-hidden="true" />
              Back to my reports
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const category = CATEGORIES[report.category];
  const dept = getDepartment(report.departmentId);
  const priority = PRIORITIES[report.priority];
  const CategoryIcon = category.icon;
  const DeptIcon = dept.icon;
  const statusCfg = DEPARTMENT_STATUS_STYLES[dept.status];
  const code = reportCodeFromId(report.id);
  const stageIndex = STAGES.findIndex((s) => s.id === report.currentStage);
  const resolved = report.currentStage === 'resolved';
  const openSla = priority.slaMinutes >= 1440 ? '24h' : `${priority.slaMinutes} min`;

  const onCopy = () => {
    const text = `${code} — ${report.title} (${report.location.label})`;
    navigator.clipboard?.writeText(text).then(
      () => toast({ tone: 'success', title: 'Copied', description: text }),
      () => toast({ tone: 'alert', title: 'Could not copy', description: text }),
    );
  };

  const onAdvance = () => {
    advanceStage(report.id);
    toast({
      tone: 'info',
      title: 'Status updated',
      description: 'A responder action has been recorded on this report.',
    });
  };

  return (
    <div className="pb-32 sm:pb-16">
      {/* ================= Header ================= */}
      <div className="relative overflow-hidden border-b border-navy-800 bg-navy-900">
        {report.priority === 'critical' && !resolved && (
          <div className="pointer-events-none absolute inset-0 stripe-critical opacity-40" aria-hidden="true" />
        )}
        <div className="pointer-events-none absolute inset-0 surface-grid-dark opacity-30" aria-hidden="true" />

        <div className="container relative py-6 sm:py-8">
          <Link
            href="/reports"
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg pr-2 text-sm font-semibold text-white/70 no-tap-highlight transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            All reports
          </Link>

          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="nums rounded-lg bg-white/10 px-2 py-1 text-xs font-bold tracking-tight text-white ring-1 ring-inset ring-white/15">
                  {code}
                </span>
                <PriorityBadge priority={report.priority} size="sm" />
                {report.currentStage === 'resolved' ? (
                  <Badge tone="reliefSolid" size="sm">
                    <CheckCircle2 className="size-3" aria-hidden="true" />
                    Resolved
                  </Badge>
                ) : (
                  <Badge tone="glass" size="sm">
                    <LiveDot className="text-relief-400" label={STAGES[stageIndex].short} />
                  </Badge>
                )}
                <span className="text-2xs font-semibold uppercase tracking-[0.1em] text-white/40">
                  {report.channel === 'voice'
                    ? 'Reported by voice'
                    : report.channel === 'sos'
                      ? 'Reported via SOS'
                      : report.channel === 'web'
                        ? 'Reported on web'
                        : 'Reported in chat'}
                </span>
              </div>

              <h1 className="mt-3 text-balance text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-3xl">
                {report.title}
              </h1>

              <p className="mt-2.5 max-w-2xl text-pretty text-sm leading-relaxed text-white/70 sm:text-base">
                {report.summary}
              </p>

              <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/60">
                <div className="flex items-center gap-1.5">
                  <Clock3 className="size-4 shrink-0 text-white/40" aria-hidden="true" />
                  <dt className="sr-only">Submitted</dt>
                  <dd className="nums font-semibold">{fullStamp(report.createdAt)}</dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <UserRound className="size-4 shrink-0 text-white/40" aria-hidden="true" />
                  <dt className="sr-only">Reporter</dt>
                  <dd className="font-semibold">{report.reporterName}</dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <Navigation className="size-4 shrink-0 text-white/40" aria-hidden="true" />
                  <dt className="sr-only">People affected</dt>
                  <dd className="nums font-semibold">
                    {formatNumber(report.peopleAffected)} affected
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
                onClick={() => toast({ tone: 'critical', title: 'Emergency contact', description: 'Nearest crew: EMS Rapid Response · 4 min' })}
              >
                <Phone aria-hidden="true" />
                Contact responder
              </Button>
              <div className="flex gap-2.5">
                <Button
                  variant="outlineNavy"
                  size="lg"
                  onClick={onCopy}
                  className="flex-1 lg:flex-none"
                >
                  <Copy aria-hidden="true" />
                  Copy ID
                </Button>
                <Button
                  variant="outlineNavy"
                  size="icon"
                  onClick={() => window.print()}
                  srLabel="Print this report"
                >
                  <Printer aria-hidden="true" />
                </Button>
                <Button
                  variant="outlineNavy"
                  size="icon"
                  onClick={() =>
                    toast({ tone: 'info', title: 'Link ready', description: `Share ${code} with a responder.` })
                  }
                  srLabel="Share this report"
                >
                  <Share2 aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-7 sm:py-9">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* ============ Main column ============ */}
          <div className="space-y-6 lg:col-span-8">
            {/* Progress stepper */}
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-100 px-5 py-4 sm:px-6">
                <div>
                  <h2 className="text-base font-bold tracking-tight text-navy-900">
                    Live progress
                  </h2>
                  <p className="mt-0.5 text-xs text-navy-500">
                    Step {stageIndex + 1} of {STAGES.length} · {STAGES[stageIndex].description}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!resolved && (
                    <Badge tone="alert" size="sm">
                      <Clock3 className="size-3" aria-hidden="true" />
                      Target: {openSla}
                    </Badge>
                  )}
                  {resolved ? (
                    <Badge tone="relief" size="sm">
                      <CheckCircle2 className="size-3" aria-hidden="true" />
                      Completed
                    </Badge>
                  ) : (
                    <LiveDot className="text-relief-600" label="Tracking" />
                  )}
                </div>
              </div>

              <div className="px-5 py-5 sm:px-6 sm:py-6">
                <ProgressStepper
                  currentStage={report.currentStage}
                  stageTimestamps={report.stageTimestamps}
                  size="lg"
                  detailed
                />
              </div>

              {!resolved && (
                <div className="flex flex-wrap items-center gap-3 border-t border-navy-100 bg-navy-50/50 px-5 py-3.5 sm:px-6">
                  <p className="min-w-0 flex-1 text-xs text-navy-500">
                    Demo control: simulate the next responder action on this report.
                  </p>
                  <Button variant="outline" size="sm" onClick={onAdvance}>
                    <Radio aria-hidden="true" />
                    Simulate next step
                  </Button>
                </div>
              )}
            </Card>

            {/* Event log */}
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-navy-100 px-5 py-4 sm:px-6">
                <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-navy-900">
                  <ClipboardList className="size-4.5 text-navy-400" aria-hidden="true" />
                  Event log
                </h2>
                <span className="nums text-xs font-semibold text-navy-400">
                  {report.timeline.length} entries
                </span>
              </div>
              <div className="px-5 py-5 sm:px-6 sm:py-6">
                <EventLog reportId={report.id} />
              </div>
            </Card>

            {/* What the assistant extracted */}
            {report.extracted.length > 0 && (
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-navy-100 bg-dispatch-50/50 px-5 py-4 sm:px-6">
                  <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-navy-900">
                    <Sparkles className="size-4.5 text-dispatch-600" aria-hidden="true" />
                    Information captured
                  </h2>
                  <Badge tone="dispatch" size="sm">
                    Extracted by FLARE
                  </Badge>
                </div>
                <div className="px-5 py-5 sm:px-6 sm:py-6">
                  <p className="mb-4 text-xs leading-relaxed text-navy-500">
                    These details were read from your conversation or SOS signal. Each is shown with
                    the confidence the assistant had, so you can spot anything that was misread.
                  </p>
                  <dl className="space-y-3">
                    {report.extracted.map((x) => (
                      <div
                        key={x.label}
                        className="rounded-xl border border-navy-200 bg-white p-3.5"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <dt className="text-2xs font-bold uppercase tracking-[0.06em] text-navy-400">
                            {x.label}
                          </dt>
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
                </div>
              </Card>
            )}
          </div>

          {/* ============ Sidebar ============ */}
          <aside className="space-y-6 lg:col-span-4">
            {/* Category + priority */}
            <Card className="overflow-hidden">
              <div className="border-b border-navy-100 px-5 py-4">
                <Label>Classification</Label>
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
                    <p className="text-sm font-bold text-navy-900">{category.label}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-navy-500">
                      {category.description}
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-5 py-4">
                <Label>Priority</Label>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <PriorityBadge priority={report.priority} size="lg" showSla />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-navy-500">
                  {priority.description}
                </p>

                {/* Priority scale */}
                <div className="mt-3 flex gap-1" aria-hidden="true">
                  {(['critical', 'high', 'medium', 'low'] as const).map((p) => (
                    <span
                      key={p}
                      className={cn(
                        'h-1.5 flex-1 rounded-full',
                        PRIORITIES[p].bar,
                        p === report.priority
                          ? 'opacity-100'
                          : ['critical', 'high', 'medium', 'low'].indexOf(p) <
                              ['critical', 'high', 'medium', 'low'].indexOf(report.priority)
                            ? 'opacity-35'
                            : 'opacity-12',
                      )}
                    />
                  ))}
                </div>
              </div>

              {report.vulnerability.length > 0 && (
                <>
                  <Separator />
                  <div className="px-5 py-4">
                    <Label>Flags for responders</Label>
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
                  </div>
                </>
              )}
            </Card>

            {/* Location */}
            <Card className="overflow-hidden">
              <div className="border-b border-navy-100 px-5 py-4">
                <Label>Location</Label>
              </div>
              <div className="p-4">
                <LocationMap
                  label={report.location.label}
                  area={report.location.area}
                  landmark={report.location.landmark}
                  critical={report.priority === 'critical'}
                />

                <dl className="mt-3.5 space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-navy-400" aria-hidden="true" />
                    <div className="min-w-0">
                      <dt className="text-2xs text-navy-400">Address</dt>
                      <dd className="font-semibold text-navy-800">{report.location.label}</dd>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Building2 className="mt-0.5 size-4 shrink-0 text-navy-400" aria-hidden="true" />
                    <div className="min-w-0">
                      <dt className="text-2xs text-navy-400">Area</dt>
                      <dd className="font-semibold text-navy-800">{report.location.area}</dd>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Crosshair className="mt-0.5 size-4 shrink-0 text-navy-400" aria-hidden="true" />
                    <div className="min-w-0">
                      <dt className="text-2xs text-navy-400">Coordinates</dt>
                      <dd className="nums font-semibold text-navy-800">
                        {report.location.lat.toFixed(4)}, {report.location.lng.toFixed(4)}
                      </dd>
                    </div>
                  </div>
                </dl>

                <div className="mt-3.5 grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm">
                    <Navigation aria-hidden="true" />
                    Directions
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      toast({ tone: 'info', title: 'Link copied', description: report.location.label })
                    }
                  >
                    <Link2 aria-hidden="true" />
                    Share pin
                  </Button>
                </div>
              </div>
            </Card>

            {/* Department + responder */}
            <Card className="overflow-hidden">
              <div className="border-b border-navy-100 px-5 py-4">
                <Label>Assigned response</Label>
              </div>

              <div className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy-900 text-white"
                    aria-hidden="true"
                  >
                    <DeptIcon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold leading-snug text-navy-900">{dept.name}</p>
                    <p className="mt-0.5 text-xs text-navy-500">{dept.coverage}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge tone="outline" size="sm" className={statusCfg.chip}>
                    <span className={cn('size-1.5 rounded-full', statusCfg.dot)} aria-hidden="true" />
                    {dept.statusLabel}
                  </Badge>
                  <span className="nums text-2xs font-semibold text-navy-500">
                    {dept.crewsAvailable}/{dept.crewsTotal} crews · ~{dept.avgResponseMinutes} min
                  </span>
                </div>

                {report.responder && (
                  <div className="mt-3.5 rounded-xl bg-relief-50 p-3.5 ring-1 ring-inset ring-relief-200">
                    <p className="text-2xs font-bold uppercase tracking-[0.08em] text-relief-700">
                      Assigned unit
                    </p>
                    <p className="mt-1 text-sm font-bold text-navy-900">
                      {report.responder.name}
                    </p>
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
                          Arriving in about {report.responder.etaMinutes} minutes
                        </span>
                      </div>
                    ) : null}
                  </div>
                )}

                <div className="mt-3.5 grid grid-cols-2 gap-2">
                  <Button variant="primary" size="sm">
                    <Phone aria-hidden="true" />
                    Call desk
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/chat">
                      <MessageSquareText aria-hidden="true" />
                      Ask AI
                    </Link>
                  </Button>
                </div>
                <p className="nums mt-2.5 text-center text-2xs text-navy-400">{dept.phone}</p>
              </div>
            </Card>

            {/* Contact preference */}
            <Card className="p-5">
              <Label>How responders reach you</Label>
              <div className="mt-2.5 flex items-center gap-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-navy-100 text-navy-700">
                  {report.contactPreference === 'call' ? (
                    <Phone className="size-4" aria-hidden="true" />
                  ) : report.contactPreference === 'sms' ? (
                    <MessageSquareText className="size-4" aria-hidden="true" />
                  ) : (
                    <Info className="size-4" aria-hidden="true" />
                  )}
                </span>
                <p className="text-sm font-semibold capitalize text-navy-800">
                  {report.contactPreference === 'none' ? 'Do not contact' : `${report.contactPreference} preferred`}
                </p>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-navy-500">
                Change this any time — responders always see your current preference.
              </p>
              <Button variant="outline" size="sm" block className="mt-3">
                <Mail aria-hidden="true" />
                Update contact details
              </Button>
            </Card>
          </aside>
        </div>

        {/* Related */}
        {report.peopleAffected > 1 && (
          <section className="mt-8" aria-labelledby="impact-heading">
            <h2
              id="impact-heading"
              className="text-xs font-bold uppercase tracking-[0.1em] text-navy-400"
            >
              People this affects
            </h2>
            <Card className="mt-3 p-5">
              <div className="flex flex-wrap items-center gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-navy-100 text-navy-700">
                  <Users className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="nums text-2xl font-extrabold leading-none text-navy-900">
                    {formatNumber(report.peopleAffected)}
                  </p>
                  <p className="mt-1 text-sm text-navy-500">people counted in this report</p>
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
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Download aria-hidden="true" />
            Export as PDF
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/reports">
              <ArrowLeft aria-hidden="true" />
              Back to all reports
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
