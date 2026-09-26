'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
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
import { Tabs } from '@/components/ui/tabs';import { useApp } from '@/lib/store';
import { CATEGORY_LIST, PRIORITY_LIST, type Priority, type StageId } from '@/lib/types';
import { cn, formatNumber } from '@/lib/utils';

type StatusFilter = 'all' | 'open' | 'resolved';
type SortKey = 'recent' | 'priority' | 'stage';

const STAGE_GROUP: Record<string, StageId[]> = {
  open: ['submitted', 'triage', 'dispatched', 'on-site'],
  resolved: ['resolved'],
  all: ['submitted', 'triage', 'dispatched', 'on-site', 'resolved'],
};

export default function ReportsPage() {
  const { reports } = useApp();
  const [status, setStatus] = React.useState<StatusFilter>('all');
  const [priority, setPriority] = React.useState<Priority | 'any'>('any');
  const [category, setCategory] = React.useState<string>('any');
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState<SortKey>('recent');
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const counts = React.useMemo(() => {
    const open = reports.filter((r) => r.currentStage !== 'resolved').length;
    return {
      all: reports.length,
      open,
      resolved: reports.length - open,
    };
  }, [reports]);

  const filtered = React.useMemo(() => {
    const stages = new Set(STAGE_GROUP[status]);
    const q = query.trim().toLowerCase();

    const list = reports.filter((r) => {
      if (!stages.has(r.currentStage)) return false;
      if (priority !== 'any' && r.priority !== priority) return false;
      if (category !== 'any' && r.category !== category) return false;
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

    const priorityRank: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const stageRank: Record<StageId, number> = {
      dispatched: 0,
      'on-site': 1,
      triage: 2,
      submitted: 3,
      resolved: 4,
    };

    return list.sort((a, b) => {
      if (sort === 'priority') return priorityRank[a.priority] - priorityRank[b.priority];
      if (sort === 'stage') return stageRank[a.currentStage] - stageRank[b.currentStage];
      return +new Date(b.createdAt) - +new Date(a.createdAt);
    });
  }, [reports, status, priority, category, query, sort]);

  const activeFilterCount =
    (priority !== 'any' ? 1 : 0) + (category !== 'any' ? 1 : 0) + (sort !== 'recent' ? 1 : 0);

  const reset = () => {
    setPriority('any');
    setCategory('any');
    setSort('recent');
    setQuery('');
  };

  return (
    <div className="pb-32 sm:pb-16">
      {/* Header */}
      <div className="border-b border-navy-200 bg-white">
        <div className="container py-7 sm:py-9">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-xl bg-navy-100 text-navy-700">
                  <FileText className="size-4.5" aria-hidden="true" />
                </span>
                <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">
                  My reports
                </h1>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-navy-500">
                Every request you have sent, with its live status. {counts.open} still open,{' '}
                {counts.resolved} resolved.
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <Button asChild variant="outline" size="lg">
                <Link href="/chat">
                  <Mic aria-hidden="true" />
                  New voice report
                </Link>
              </Button>
              <Button asChild variant="sos" size="lg" className="stripe-critical">
                <Link href="/dashboard">
                  <PhoneCall aria-hidden="true" />
                  Emergency SOS
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-6 sm:py-8">
        {/* Status tabs */}
        <Tabs
          value={status}
          onValueChange={(v) => setStatus(v as StatusFilter)}
          label="Filter reports by status"
          className="max-w-md"
          items={[
            { id: 'all', label: 'All', badge: <Count n={counts.all} /> },
            { id: 'open', label: 'Open', badge: <Count n={counts.open} /> },
            { id: 'resolved', label: 'Resolved', badge: <Count n={counts.resolved} /> },
          ]}
        />

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* ---- Filters ---- */}
          <aside className="lg:col-span-3">
            {/* Mobile filter toggle */}
            <Button
              variant="outline"
              size="lg"
              block
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              className="lg:hidden"
            >
              <SlidersHorizontal aria-hidden="true" />
              Filters
              {activeFilterCount > 0 && (
                <Badge tone="navy" size="xs">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>

            <Card
              className={cn(
                'mt-3 p-4 lg:mt-0 lg:block',
                filtersOpen ? 'block' : 'hidden',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-bold text-navy-900">
                  <ListFilter className="size-4" aria-hidden="true" />
                  Narrow down
                </h2>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="xs" onClick={reset}>
                    <X className="size-3.5" aria-hidden="true" />
                    Reset
                  </Button>
                )}
              </div>

              {/* Search */}
              <div className="relative mt-3.5">
                <label htmlFor="report-search" className="sr-only">
                  Search reports
                </label>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-navy-400"
                  aria-hidden="true"
                />
                <input
                  id="report-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ID, address, keyword…"
                  className="h-10 w-full rounded-lg border border-navy-200 bg-white pl-9 pr-3 text-sm text-navy-800 placeholder:text-navy-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600"
                />
              </div>

              <fieldset className="mt-5">
                <legend className="text-2xs font-bold uppercase tracking-[0.08em] text-navy-400">
                  Priority
                </legend>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <FilterChip active={priority === 'any'} onClick={() => setPriority('any')}>
                    Any
                  </FilterChip>
                  {PRIORITY_LIST.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPriority(p.id)}
                      aria-pressed={priority === p.id}
                      className={cn(
                        'min-h-[32px] rounded-full px-2.5 text-xs font-bold ring-1 ring-inset no-tap-highlight transition-colors duration-200',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600 focus-visible:ring-offset-2',
                        priority === p.id
                          ? p.chip
                          : 'bg-white text-navy-500 ring-navy-200 hover:bg-navy-50',
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="mt-5">
                <legend className="text-2xs font-bold uppercase tracking-[0.08em] text-navy-400">
                  Category
                </legend>
                <div className="mt-2 space-y-1">
                  <FilterRow
                    active={category === 'any'}
                    onClick={() => setCategory('any')}
                    label="All categories"
                    count={reports.length}
                  />
                  {CATEGORY_LIST.map((c) => {
                    const count = reports.filter((r) => r.category === c.id).length;
                    return (
                      <FilterRow
                        key={c.id}
                        active={category === c.id}
                        onClick={() => setCategory(c.id)}
                        label={c.label}
                        count={count}
                        icon={c.icon}
                      />
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="mt-5">
                <legend className="text-2xs font-bold uppercase tracking-[0.08em] text-navy-400">
                  Sort by
                </legend>
                <div className="mt-2 space-y-1">
                  {(
                    [
                      { id: 'recent', label: 'Most recent' },
                      { id: 'priority', label: 'Highest priority' },
                      { id: 'stage', label: 'Furthest along' },
                    ] as const
                  ).map((s) => (
                    <FilterRow
                      key={s.id}
                      active={sort === s.id}
                      onClick={() => setSort(s.id)}
                      label={s.label}
                    />
                  ))}
                </div>
              </fieldset>
            </Card>

            {/* Priority legend — explains the SLA promises. */}
            <Card className="mt-4 hidden p-4 lg:block">
              <h2 className="text-2xs font-bold uppercase tracking-[0.08em] text-navy-400">
                Response targets
              </h2>
              <ul className="mt-2.5 space-y-2">
                {PRIORITY_LIST.map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <PriorityBadge priority={p.id} size="xs" showSla />
                  </li>
                ))}
              </ul>
            </Card>
          </aside>

          {/* ---- List ---- */}
          <section aria-labelledby="list-heading" className="lg:col-span-9">
            <h2 id="list-heading" className="sr-only">
              Reports matching your filters
            </h2>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p role="status" aria-live="polite" className="text-sm text-navy-500">
                <span className="nums font-bold text-navy-900">{formatNumber(filtered.length)}</span>{' '}
                report{filtered.length === 1 ? '' : 's'}
                {query && (
                  <>
                    {' '}
                    matching &ldquo;<span className="font-semibold text-navy-700">{query}</span>&rdquo;
                  </>
                )}
              </p>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="xs" onClick={reset} className="lg:invisible">
                  <X className="size-3.5" aria-hidden="true" />
                  Clear filters
                </Button>
              )}
            </div>

            {filtered.length === 0 ? (
              <Card className="px-6 py-14 text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-navy-100 text-navy-500">
                  <Search className="size-7" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-bold text-navy-900">No reports match</h3>
                <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-navy-500">
                  Try widening your filters, or send a new report if you need help right now.
                </p>
                <div className="mt-5 flex flex-col justify-center gap-2.5 sm:flex-row">
                  <Button variant="outline" onClick={reset}>
                    <X aria-hidden="true" />
                    Clear filters
                  </Button>
                  <Button asChild variant="primary">
                    <Link href="/chat">
                      <Mic aria-hidden="true" />
                      New report
                    </Link>
                  </Button>
                </div>
              </Card>
            ) : (
              <ul className="space-y-3.5">
                {filtered.map((report) => (
                  <li key={report.id}>
                    <ReportCard report={report} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

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

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-[32px] rounded-full px-2.5 text-xs font-bold ring-1 ring-inset no-tap-highlight transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600 focus-visible:ring-offset-2',
        active
          ? 'bg-navy-900 text-white ring-navy-900'
          : 'bg-white text-navy-500 ring-navy-200 hover:bg-navy-50',
      )}
    >
      {children}
    </button>
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
