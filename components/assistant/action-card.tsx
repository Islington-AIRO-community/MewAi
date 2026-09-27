'use client';

import * as React from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Radio,
  ShieldCheck,
  Sparkles,
  Target,
  X,
  Zap,
} from 'lucide-react';
import type { ActionCard } from '@/lib/types';
import { DEPARTMENT_STATUS_STYLES, getDepartment } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, reportCodeFromId, shortStamp } from '@/lib/utils';
import { Eyebrow } from '@/components/ui/primitives';
import { useLocale } from '@/lib/i18n';

/**
 * System Action Card.
 *
 * The moment the assistant extracts something actionable, it surfaces this
 * banner: what was understood, which department it is going to, and a single
 * explicit "Confirm & dispatch" control. Nothing is dispatched without a
 * human confirming — the AI never acts silently.
 */
export function ActionCardBanner({
  card,
  onConfirm,
  onDismiss,
  className,
}: {
  card: ActionCard;
  onConfirm?: (card: ActionCard) => void;
  onDismiss?: (card: ActionCard) => void;
  className?: string;
}) {
  const dept = getDepartment(card.departmentId);
  const statusCfg = DEPARTMENT_STATUS_STYLES[dept.status];
  const confirmed = card.status === 'confirmed';
  const dismissed = card.status === 'dismissed';
  const DeptIcon = dept.icon;
  const { t, label } = useLocale();
  const deptName = label('department', dept.id, dept.name);

  if (dismissed) return null;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.99 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      aria-label={t('cardBanner.ariaLabel', { dept: deptName })}
      className={cn(
        'relative overflow-hidden rounded-2xl border shadow-soft',
        confirmed ? 'border-relief-300 bg-relief-50/70' : 'border-dispatch-200 bg-white',
        className,
      )}
    >
      {/* Accent rail */}
      <span
        className={cn(
          'absolute inset-y-0 left-0 w-1',
          confirmed ? 'bg-relief-500' : 'bg-dispatch-500',
        )}
        aria-hidden="true"
      />

      {/* Header */}
      <header className="flex items-start gap-3 pb-3 pt-4 pl-5 pr-4">
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-xl ring-1 ring-inset',
            confirmed
              ? 'bg-relief-100 text-relief-700 ring-relief-200'
              : 'bg-dispatch-50 text-dispatch-700 ring-dispatch-200',
          )}
        >
          {confirmed ? (
            <CheckCircle2 className="size-4.5" aria-hidden="true" />
          ) : (
            <Sparkles className="size-4.5" aria-hidden="true" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Eyebrow className="text-navy-400">{card.title}</Eyebrow>
            <Badge
              tone="outline"
              size="xs"
              className="bg-white font-mono text-navy-600 ring-navy-200"
            >
              <Target className="size-3" aria-hidden="true" />
              {t('cardBanner.confident', { n: Math.round(card.confidence * 100) })}
            </Badge>
          </div>

          <p className="mt-1 text-sm font-bold leading-snug tracking-tight text-navy-900">
            {card.headline}
          </p>
        </div>

        {!confirmed && onDismiss && (
          <Button
            variant="ghost"
            size="iconSm"
            onClick={() => onDismiss(card)}
            srLabel={t('cardBanner.dismiss')}
            className="-mr-1 -mt-0.5 shrink-0 text-navy-400 hover:text-navy-700"
          >
            <X aria-hidden="true" />
          </Button>
        )}
      </header>

      {/* Extracted fields */}
      <div className="px-5 pb-3.5 pl-5">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-xl bg-navy-50/80 p-3 ring-1 ring-inset ring-navy-200/70 sm:grid-cols-2">
          {card.fields.map((f) => (
            <div key={f.label} className="min-w-0">
              <Eyebrow as="dt">{f.label}</Eyebrow>
              <dd className="mt-0.5 truncate text-xs font-semibold text-navy-800" title={f.value}>
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Routing target */}
      <div className="mx-5 mb-3.5 rounded-xl border border-navy-200 bg-white p-3">
        <Eyebrow>{t('cardBanner.routing')}</Eyebrow>

        <div className="mt-2 flex items-center gap-2.5">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-navy-900 text-white"
            aria-hidden="true"
          >
            <DeptIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-navy-900">{deptName}</p>
            <p className="truncate text-2xs text-navy-500">
              {t('cardBanner.crews', {
                available: dept.crewsAvailable,
                total: dept.crewsTotal,
                n: dept.avgResponseMinutes,
              })}
            </p>
          </div>
          <Badge
            tone="outline"
            size="sm"
            className={cn('shrink-0', statusCfg.chip)}
          >
            <span className={cn('size-1.5 rounded-full', statusCfg.dot)} aria-hidden="true" />
            {label('status', dept.status, dept.statusLabel)}
          </Badge>
        </div>
      </div>

      {/* Actions */}
      <footer className="flex flex-wrap items-center gap-2.5 border-t border-navy-100 bg-navy-50/50 px-5 py-3">
        <AnimatePresence mode="wait" initial={false}>
          {confirmed ? (
            <motion.div
              key="confirmed"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-1 flex-wrap items-center gap-2.5"
            >
              <p className="flex items-center gap-1.5 text-sm font-bold text-relief-700">
                <Check className="size-4" strokeWidth={3} aria-hidden="true" />
                {t('cardBanner.dispatchedTo', {
                  dept: label('departmentShort', dept.id, dept.shortName),
                })}
              </p>
              {card.reportId && (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/reports/${card.reportId}`}>
                    <Radio className="size-4" aria-hidden="true" />
                    {t('cardBanner.track', { code: reportCodeFromId(card.reportId) })}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="pending"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-1 flex-wrap items-center gap-2.5"
            >
              <Button
                variant="primary"
                size="sm"
                onClick={() => onConfirm?.(card)}
                className="bg-dispatch-600 hover:bg-dispatch-700"
              >
                <Zap className="size-4" aria-hidden="true" />
                {t('cardBanner.confirm')}
              </Button>
              {onDismiss && (
                <Button variant="ghost" size="sm" onClick={() => onDismiss(card)}>
                  {t('cardBanner.edit')}
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <p className="ml-auto flex items-center gap-1 text-2xs text-navy-400">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          <span className="nums">{shortStamp(card.createdAt)}</span>
        </p>
      </footer>

      {/* Live region for screen readers when the card appears */}
      <span role="status" aria-live="polite" className="sr-only">
        {t(confirmed ? 'cardBanner.srConfirmed' : 'cardBanner.srPending', { dept: deptName })}
      </span>
    </motion.article>
  );
}
