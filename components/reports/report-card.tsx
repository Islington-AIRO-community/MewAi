'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Accessibility,
  Baby,
  ChevronRight,
  Clock3,
  MapPin,
  Radio,
  Users,
  Waves,
} from 'lucide-react';
import type { Report } from '@/lib/types';
import { CATEGORIES, getDepartment } from '@/lib/types';
import { cn, relativeTime, reportCodeFromId, shortStamp } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PriorityBadge, StageChip } from './badges';
import { StepperBar } from './progress-stepper';
import { useLocale } from '@/lib/i18n';

/**
 * Report card. The whole card is clickable via a stretched link, while
 * every nested control stays independently reachable by keyboard.
 */
export function ReportCard({
  report,
  className,
  compact = false,
  titleTag: TitleTag = 'h3',
}: {
  report: Report;
  className?: string;
  compact?: boolean;
  /**
   * Heading level for the report title, so the card can be dropped into any
   * section without breaking the document outline. Use `'p'` when the card is
   * a decorative teaser directly under an existing heading.
   */
  titleTag?: 'h2' | 'h3' | 'h4' | 'p';
}) {
  const { t, label: tlabel } = useLocale();
  const category = CATEGORIES[report.category];
  const dept = getDepartment(report.departmentId);
  const CategoryIcon = category.icon;
  const code = reportCodeFromId(report.id);
  const critical = report.priority === 'critical';
  const resolved = report.currentStage === 'resolved';

  return (
    <Card
      className={cn(
        'group relative overflow-hidden transition-shadow duration-300 hover:shadow-card',
        // The title link is stretched over the whole card, so the card itself has
        // to carry the focus ring — otherwise keyboard users see nothing at all.
        'focus-within:ring-2 focus-within:ring-dispatch-600 focus-within:ring-offset-2',
        critical && !resolved && 'edge-critical',
        resolved && 'opacity-95',
        className,
      )}
    >
      {/* Priority wash for critical items — with a redundant stripe pattern. */}
      {critical && !resolved && (
        <div className="pointer-events-none absolute inset-0 stripe-critical opacity-60" aria-hidden="true" />
      )}

      <div className="relative p-4 sm:p-5">
        <div className="flex items-start gap-3.5">
          <span
            className={cn(
              'grid size-11 shrink-0 place-items-center rounded-xl ring-1 ring-inset',
              category.chip,
            )}
            aria-hidden="true"
          >
            <CategoryIcon className="size-5" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="nums rounded-md bg-navy-100 px-1.5 py-0.5 text-2xs font-bold tracking-tight text-navy-700">
                {code}
              </span>
              <PriorityBadge priority={report.priority} size="sm" />
              <StageChip stage={report.currentStage} />
              <span className="inline-flex items-center gap-1 text-2xs font-semibold text-navy-400">
                <Radio className="size-3" aria-hidden="true" />
                {t(`card.channel.${report.channel}`)}
              </span>
            </div>

            <TitleTag className="mt-2 text-[15px] font-bold leading-snug tracking-tight text-navy-900 sm:text-base">
              <Link
                href={`/reports/${report.id}`}
                className="rounded transition-colors after:absolute after:inset-0 after:content-[''] hover:text-dispatch-700 focus-visible:outline-none"
              >
                <span className="absolute left-0 top-0 z-20 h-full w-1" aria-hidden="true" />
                {report.title}
                <span className="sr-only">{t('card.openFull', { code })}</span>
              </Link>
            </TitleTag>

            {!compact && (
              <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-navy-600">
                {report.summary}
              </p>
            )}

            {/* Meta row */}
            <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-navy-500">
              <div className="flex items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0 text-navy-400" aria-hidden="true" />
                <dt className="sr-only">{t('card.location')}</dt>
                <dd className="max-w-[16rem] truncate font-semibold text-navy-600">
                  {report.location.label}, {report.location.area}
                </dd>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock3 className="size-3.5 shrink-0 text-navy-400" aria-hidden="true" />
                <dt className="sr-only">{t('detail.submitted')}</dt>
                <dd className="nums font-semibold text-navy-600">
                  {relativeTime(report.createdAt)} · {shortStamp(report.createdAt)}
                </dd>
              </div>
              {report.peopleAffected > 0 && (
                <div className="flex items-center gap-1.5">
                  <Users className="size-3.5 shrink-0 text-navy-400" aria-hidden="true" />
                  <dt className="sr-only">{t('detail.peopleAffected')}</dt>
                  <dd className="nums font-semibold text-navy-600">
                    {t('detail.affected', { n: report.peopleAffected })}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <ChevronRight
            className="mt-1 size-5 shrink-0 text-navy-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-navy-500"
            aria-hidden="true"
          />
        </div>

        {/* Vulnerability flags — the details a responder scans for first. */}
        {!compact && report.vulnerability.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {report.vulnerability.slice(0, 3).map((v) => (
              <li key={v}>
                <Badge
                  tone="outline"
                  size="xs"
                  className="bg-navy-50 font-medium text-navy-600 ring-navy-200"
                >
                  <VulnIcon label={v} />
                  {v}
                </Badge>
              </li>
            ))}
            {report.vulnerability.length > 3 && (
              <li>
                <Badge tone="quiet" size="xs">
                  {t('card.moreFlags', { n: report.vulnerability.length - 3 })}
                </Badge>
              </li>
            )}
          </ul>
        )}

        {/* Department + responder */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-navy-100 pt-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-600 ring-1 ring-inset ring-navy-200"
              aria-hidden="true"
            >
              <dept.icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-navy-800">
                {tlabel('departmentShort', dept.id, dept.shortName)}
              </p>
              <p className="truncate text-2xs text-navy-400">
                {report.responder
                  ? `${report.responder.callSign}${report.responder.etaMinutes ? ` · ${t('card.eta', { n: report.responder.etaMinutes })}` : ''}`
                  : t('card.awaitingCrew')}
              </p>
            </div>
          </div>

          {report.etaMinutes ? (
            <Badge tone={report.etaMinutes <= 8 ? 'emergency' : 'dispatch'} size="sm">
              <Waves className="size-3" aria-hidden="true" />
              {t('card.eta', { n: report.etaMinutes })}
            </Badge>
          ) : (
            <Badge tone="quiet" size="sm">
              {t('card.assigned')}
            </Badge>
          )}
        </div>

        {!compact && (
          <div className="mt-3.5">
            <StepperBar report={report} />
          </div>
        )}
      </div>
    </Card>
  );
}

function VulnIcon({ label }: { label: string }) {
  const l = label.toLowerCase();
  const Icon = l.includes('child') || l.includes('infant')
    ? Baby
    : l.includes('water') || l.includes('drown')
      ? Waves
      : l.includes('wheelchair') || l.includes('mobility') || l.includes('moved')
        ? Accessibility
        : l.includes('asthma') || l.includes('respirat') || l.includes('oxygen')
          ? Users
          : null;
  return Icon ? <Icon className="size-3" aria-hidden="true" /> : null;
}

/* ------------------------------------------------------------------ *
 * Compact list row — used in sidebars and "recent activity" feeds
 * ------------------------------------------------------------------ */

export function ReportRow({ report, className }: { report: Report; className?: string }) {
  const category = CATEGORIES[report.category];
  const CategoryIcon = category.icon;
  const code = reportCodeFromId(report.id);

  return (
    <li className={cn('relative', className)}>
      <Link
        href={`/reports/${report.id}`}
        className={cn(
          'relative flex items-center gap-3 rounded-xl p-2.5 no-tap-highlight',
          'transition-colors duration-200 hover:bg-navy-50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600 focus-visible:ring-offset-2',
        )}
      >
        <span
          className={cn('grid size-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset', category.chip)}
          aria-hidden="true"
        >
          <CategoryIcon className="size-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="nums text-2xs font-bold text-navy-500">{code}</span>
            <PriorityBadge priority={report.priority} size="xs" />
          </span>
          <span className="mt-0.5 block truncate text-sm font-semibold text-navy-800">
            {report.title}
          </span>
          <span className="mt-0.5 block truncate text-2xs text-navy-400">
            {report.location.area} · {relativeTime(report.updatedAt)}
          </span>
        </span>
      </Link>
    </li>
  );
}
