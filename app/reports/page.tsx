'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  FileText,
  ListFilter,
  Mic,
  PhoneCall,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ReportCard } from '@/components/reports/report-card';
import { PriorityBadge } from '@/components/reports/badges';
import { Tabs } from '@/components/ui/tabs';
import { useApp } from '@/lib/store';
import { CATEGORY_LIST, PRIORITY_LIST, type Priority, type Report, type StageId } from '@/lib/types';
import { cn, formatNumber } from '@/lib/utils';
import { Eyebrow } from '@/components/ui/primitives';
import { PageHeader, StateCard } from '@/components/ui/patterns';
import { FilterChip, SearchField } from '@/components/ui/inputs';
import { useLocale } from '@/lib/i18n';

type StatusFilter = 'all' | 'open' | 'resolved';
type SortKey = 'recent' | 'priority' | 'stage';

const STAGE_GROUP: Record<string, StageId[]> = {
  open: ['submitted', 'triage', 'dispatched', 'on-site'],
  resolved: ['resolved'],
  all: ['submitted', 'triage', 'dispatched', 'on-site', 'resolved'],
};

/** The four narrowing controls, as one value. Bundled so a sub-component takes
 *  one prop instead of eight; see `useReportFilters`. */
interface Filters {
  query: string;
  priority: Priority | 'any';
  category: string;
  sort: SortKey;
}

const NO_FILTERS: Filters = { query: '', priority: 'any', category: 'any', sort: 'recent' };

/**
 * Everything the narrow-down panel and the result list share.
 *
 * Split out of the page component because the filtering is a model, not a view:
 * the rank tables and the search haystack were the first thing to get out of
 * date when a field was added to `Report`, and being buried 60 lines above the
 * markup that renders them is why. `setFilter` takes a partial rather than four
 * setters so `FilterPanel` needs one prop instead of eight.
 *
 * `status` stays out of `Filters` on purpose. It is a *view* of the same set —
 * a tab strip above the grid, not a narrowing control — so it is returned
 * separately and the tab counts are the only other consumer.
 */
function useReportFilters(reports: Report[]) {
  const [status, setStatus] = React.useState<StatusFilter>('all');
  const [filters, setFilters] = React.useState<Filters>(NO_FILTERS);
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const setFilter = React.useCallback(
    (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch })),
    [],
  );

  const counts = React.useMemo(() => {
    const open = reports.filter((r) => r.currentStage !== 'resolved').length;
    return { all: reports.length, open, resolved: reports.length - open };
  }, [reports]);

  const filtered = React.useMemo(() => {
    const stages = new Set(STAGE_GROUP[status]);
    const q = filters.query.trim().toLowerCase();

    const list = reports.filter((r) => {
      if (!stages.has(r.currentStage)) return false;
      if (filters.priority !== 'any' && r.priority !== filters.priority) return false;
      if (filters.category !== 'any' && r.category !== filters.category) return false;
      if (q) {
        const haystack = [
          r.id,
          r.title,
          r.summary,
          r.location.label,
          r.location.area,
          r.reporterName,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      if (filters.sort === 'priority') return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (filters.sort === 'stage') return STAGE_RANK[a.currentStage] - STAGE_RANK[b.currentStage];
      return +new Date(b.createdAt) - +new Date(a.createdAt);
    });
  }, [reports, status, filters]);

  const activeFilterCount =
    (filters.priority !== 'any' ? 1 : 0) +
    (filters.category !== 'any' ? 1 : 0) +
    (filters.sort !== 'recent' ? 1 : 0);

  const reset = React.useCallback(() => setFilters(NO_FILTERS), []);

  return {
    status,
    setStatus,
    counts,
    filtered,
    filters,
    setFilter,
    filtersOpen,
    setFiltersOpen,
    activeFilterCount,
    reset,
  };
}

const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const STAGE_RANK: Record<StageId, number> = {
  dispatched: 0,
  'on-site': 1,
  triage: 2,
  submitted: 3,
  resolved: 4,
};

export default function ReportsPage() {
  const { reports, openSos } = useApp();
  const { t } = useLocale();
  const {
    status,
    setStatus,
    counts,
    filtered,
    filters,
    setFilter,
    filtersOpen,
    setFiltersOpen,
    activeFilterCount,
    reset,
  } = useReportFilters(reports);

  return (
    <div className="pb-[var(--content-bottom)] sm:pb-16">
      {/* Header */}
      <PageHeader
        icon={FileText}
        title={t('reports.title')}
        description={t('reports.subtitleCounts', {
          open: counts.open,
          resolved: counts.resolved,
        })}
        actions={
          <>
            <Button asChild variant="outline" size="lg">
              <Link href="/chat">
                <Mic aria-hidden="true" />
                {t('reports.newVoice')}
              </Link>
            </Button>
            {/*
              Opens the dialog rather than navigating. This was a link to
              `/dashboard` behind an emergency label, so the control a responder
              would reach for mid-incident took them to a dashboard instead.
            */}
            <Button
              type="button"
              variant="sos"
              size="lg"
              className="stripe-critical"
              onClick={openSos}
            >
              <PhoneCall aria-hidden="true" />
              {t('sos.button')}
            </Button>
          </>
        }
      />

      <div className="container py-6 sm:py-8">
        {/* Status tabs */}
        <Tabs
          value={status}
          onValueChange={(v) => setStatus(v as StatusFilter)}
          label={t('reports.filterLabel')}
          className="max-w-md"
          semantics="toggle-group"
          items={[
            { id: 'all', label: t('reports.all'), badge: <Count n={counts.all} /> },
            { id: 'open', label: t('reports.open'), badge: <Count n={counts.open} /> },
            { id: 'resolved', label: t('reports.resolved'), badge: <Count n={counts.resolved} /> },
          ]}
        />

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
          <FilterPanel
            reports={reports}
            filters={filters}
            setFilter={setFilter}
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            activeFilterCount={activeFilterCount}
            onReset={reset}
          />

          <ReportList
            reports={filtered}
            query={filters.query}
            canReset={activeFilterCount > 0}
            onReset={reset}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * The result column: a live count, a clear-filters escape, and either the
 * matches or the empty state.
 *
 * The count is `role="status"` and therefore announced on every keystroke, which
 * is the point — someone typing an address needs to know whether it narrowed
 * anything without having to look. The "Clear filters" button is `lg:invisible`
 * rather than absent so the row does not reflow when a filter is applied; the
 * sidebar's own Reset is the visible one at that width.
 */
function ReportList({
  reports,
  query,
  canReset,
  onReset,
}: {
  reports: Report[];
  query: string;
  canReset: boolean;
  onReset: () => void;
}) {
  const { t } = useLocale();
  return (
    <section aria-labelledby="list-heading" className="lg:col-span-9">
      <h2 id="list-heading" className="sr-only">
        {t('reports.matchingHeading')}
      </h2>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p role="status" aria-live="polite" className="text-sm text-navy-500">
          {t(reports.length === 1 ? 'reports.result' : 'reports.resultPlural', {
            n: formatNumber(reports.length),
          })}
          {query && t('reports.resultMatching', { query })}
        </p>
        {canReset && (
          <Button variant="ghost" size="xs" onClick={onReset} className="lg:invisible">
            <X className="size-3.5" aria-hidden="true" />
            {t('reports.clearFilters')}
          </Button>
        )}
      </div>

      {reports.length === 0 ? (
        <StateCard
          icon={Search}
          titleAs="h3"
          title={t('reports.empty')}
          action={
            <div className="flex flex-col justify-center gap-2.5 sm:flex-row">
              <Button variant="outline" onClick={onReset}>
                <X aria-hidden="true" />
                {t('reports.clearFilters')}
              </Button>
              <Button asChild variant="primary">
                <Link href="/chat">
                  <Mic aria-hidden="true" />
                  {t('reports.newReport')}
                </Link>
              </Button>
            </div>
          }
        >
          {t('reports.emptyBody')}
        </StateCard>
      ) : (
        <ul className="space-y-3.5">
          {reports.map((report) => (
            <li key={report.id}>
              <ReportCard report={report} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The narrow-down column.
 *
 * A separate component mostly so `open` has a home: the panel is `hidden` below
 * `lg` and the toggle button that reveals it is the only thing outside the card
 * that knows whether it is open, so the two were previously a pair of props
 * threaded through a 120-line return for no other reason.
 */
function FilterPanel({
  reports,
  filters,
  setFilter,
  open,
  onToggle,
  activeFilterCount,
  onReset,
}: {
  reports: Report[];
  filters: Filters;
  setFilter: (patch: Partial<Filters>) => void;
  open: boolean;
  onToggle: () => void;
  activeFilterCount: number;
  onReset: () => void;
}) {
  const { t, label } = useLocale();
  return (
    <aside className="lg:col-span-3">
      {/* Mobile filter toggle */}
      <Button
        variant="outline"
        size="lg"
        block
        onClick={onToggle}
        aria-expanded={open}
        className="lg:hidden"
      >
        <SlidersHorizontal aria-hidden="true" />
        {t('reports.filters')}
        {activeFilterCount > 0 && (
          <Badge tone="navy" size="xs">
            {activeFilterCount}
          </Badge>
        )}
      </Button>

      <Card
        className={cn('mt-3 p-4 lg:mt-0 lg:block', open ? 'block' : 'hidden')}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-navy-900">
            <ListFilter className="size-4" aria-hidden="true" />
            {t('reports.narrowDown')}
          </h2>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="xs" onClick={onReset}>
              <X className="size-3.5" aria-hidden="true" />
              {t('reports.reset')}
            </Button>
          )}
        </div>

        {/* Search */}
        <SearchField
          id="report-search"
          className="mt-3.5"
          value={filters.query}
          onChange={(e) => setFilter({ query: e.target.value })}
          placeholder={t('reports.searchPlaceholder')}
          aria-label={t('reports.search')}
        />

        <fieldset className="mt-5">
          <Eyebrow as="legend">{t('reports.priority')}</Eyebrow>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <FilterChip active={filters.priority === 'any'} onClick={() => setFilter({ priority: 'any' })}>
              {t('reports.any')}
            </FilterChip>
            {PRIORITY_LIST.map((p) => (
              <FilterChip
                key={p.id}
                active={filters.priority === p.id}
                onClick={() => setFilter({ priority: p.id })}
                activeClassName={p.chip}
              >
                {label('priority', p.id, p.label)}
              </FilterChip>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <Eyebrow as="legend">{t('reports.category')}</Eyebrow>
          <div className="mt-2 space-y-1">
            <FilterRow
              active={filters.category === 'any'}
              onClick={() => setFilter({ category: 'any' })}
              label={t('reports.allCategories')}
              count={reports.length}
            />
            {CATEGORY_LIST.map((c) => {
              const count = reports.filter((r) => r.category === c.id).length;
              return (
                <FilterRow
                  key={c.id}
                  active={filters.category === c.id}
                  onClick={() => setFilter({ category: c.id })}
                  label={label('category', c.id, c.label)}
                  count={count}
                  icon={c.icon}
                />
              );
            })}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <Eyebrow as="legend">{t('reports.sortBy')}</Eyebrow>
          <div className="mt-2 space-y-1">
            {SORT_OPTIONS.map((s) => (
              <FilterRow
                key={s.id}
                active={filters.sort === s.id}
                onClick={() => setFilter({ sort: s.id })}
                label={t(`reports.sort.${s.id}`)}
              />
            ))}
          </div>
        </fieldset>
      </Card>

      {/* Priority legend — explains the SLA promises. */}
      <Card className="mt-4 hidden p-4 lg:block">
        <Eyebrow as="h2">{t('reports.responseTargets')}</Eyebrow>
        <ul className="mt-2.5 space-y-2">
          {PRIORITY_LIST.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <PriorityBadge priority={p.id} size="xs" showSla />
            </li>
          ))}
        </ul>
      </Card>
    </aside>
  );
}

/** Sort keys as data, so `FilterRow` can take the translated label. */
const SORT_OPTIONS = [
  { id: 'recent' },
  { id: 'priority' },
  { id: 'stage' },
] as const satisfies readonly { id: SortKey }[];

function Count({ n }: { n: number }) {
  return (
    <span
      className={cn(
        'nums rounded-full px-1.5 py-0.5 text-2xs font-bold',
        'bg-navy-200/70 text-navy-700',
      )}
    >
      {n}
    </span>
  );
}

function FilterRow({
  active,
  onClick,
  label,
  count,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold no-tap-highlight transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600 focus-visible:ring-offset-2',
        active ? 'bg-navy-900 text-white' : 'text-navy-600 hover:bg-navy-50',
      )}
    >
      {Icon && (
        <Icon
          className={cn('size-4 shrink-0', active ? 'text-white' : 'text-navy-400')}
        />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span
          className={cn(
            'nums shrink-0 text-2xs font-bold',
            active ? 'text-white/70' : 'text-navy-400',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
