'use client';

import * as React from 'react';
import { ClipboardList, Loader2, Mic, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  TicketStatusBadge,
  ticketStatusDetail,
} from '@/components/assistant/ticket-status';
import { PRIORITIES, SUPPORT_TYPE_LIST, type SupportType } from '@/lib/types';
import {
  portalErrorKey,
  fetchAdminQueue,
  fetchAdminStats,
  fetchAdminTranscript,
  setTicketStatus,
  type TicketStats,
  type TranscriptTurn,
} from '@/lib/ticket-portal';
import { formatDateTime } from '@/lib/time';
import type { StoredTicket, TicketStatus } from '@/lib/ai-client';
import { cn } from '@/lib/utils';
import { TicketTranscriptView } from '@/components/assistant/ticket-transcript';
import { Eyebrow } from '@/components/ui/primitives';
import { LoadingBlock, Notice, PageHeader } from '@/components/ui/patterns';
import { FilterChip } from '@/components/ui/inputs';
import { intlLocale } from '@/lib/i18n-strings';
import { useLocale } from '@/lib/i18n';

/**
 * The response team's queue.
 *
 * Deliberately the smallest thing that makes `status` real. The status a
 * reporter sees on their portal is read from the row, and nothing in the system
 * ever moved that row — so until an operator can, every ticket reads "not
 * reviewed yet" forever and the status feature is decorative. This is the
 * button that changes that, calling the `PATCH /api/tickets/{id}/status`
 * endpoint that already existed unused.
 *
 * Access control is an `ADMIN_EMAILS` allowlist, enforced in
 * `app/api/ai/_session.ts` on the response path and again in `middleware.ts` for
 * the redirect. The allowlist is the whole permission model: there is no role
 * table and no `users` table behind it. An unset list admits nobody.
 *
 * A client component, so no `metadata` and no `generateStaticParams` here.
 */
const STATUS_ORDER: TicketStatus[] = [
  'submitted',
  'under_review',
  'dispatched',
  'resolved',
  'closed',
];

export default function AdminQueuePage() {
  const { t, label, locale } = useLocale();
  const [tickets, setTickets] = React.useState<StoredTicket[] | null>(null);
  const [stats, setStats] = React.useState<TicketStats | null>(null);
  // A translation key, not a sentence — see `portalErrorKey`.
  const [errorKey, setErrorKey] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<TicketStatus | 'all'>('all');
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async (status: TicketStatus | 'all') => {
    setLoading(true);
    const result = await fetchAdminQueue(status === 'all' ? undefined : status);
    if (result.ok) {
      setTickets(result.value.tickets);
      setErrorKey(null);
    } else {
      setTickets(null);
      setErrorKey(queueErrorKey(result.error.kind));
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load(filter);
  }, [filter, load]);

  /**
   * Counts are a second request, and a failure here is deliberately silent.
   *
   * The queue is what a responder is working from; the counts are context. If
   * `GET /api/tickets/stats` fails while the queue succeeds - an older backend,
   * a proxy hiccup - the responder still gets a usable queue, and a `0` or a
   * "could not load" banner standing in for the numbers would be worse than the
   * numbers being briefly absent. It also does not block: awaiting this
   * alongside the queue would delay the list in order to decorate it.
   *
   * Keyed on `filter` as well as `tickets` so a status move re-reads the counts:
   * the whole point of the panel is to move when the distribution moves, and
   * advancing a ticket is exactly the action that changes a bucket.
   */
  const [statsNonce, setStatsNonce] = React.useState(0);
  React.useEffect(() => {
    let cancelled = false;
    void fetchAdminStats().then((result) => {
      if (!cancelled && result.ok) setStats(result.value);
    });
    return () => {
      cancelled = true;
    };
  }, [filter, tickets, statsNonce]);

  const advance = async (ticket: StoredTicket, status: TicketStatus) => {
    setBusyId(ticket.id);
    const result = await setTicketStatus(ticket.id, status);
    setBusyId(null);
    if (result.ok) {
      // Trust the server's copy of the row, not the optimistic guess — it also
      // carries the `updated_at` the transition just wrote.
      setTickets((prev) =>
        prev
          ? prev.map((t) => (t.id === result.value.id ? result.value : t))
          : prev,
      );
      setStatsNonce((n) => n + 1);
      return;
    }
    setErrorKey(queueErrorKey(result.error.kind));
  };

  return (
    // `data-no-translate`: the response queue is somebody else's emergency, read
    // by an operator. It carries reporter names, phone numbers and addresses
    // that no model should touch, and its status vocabulary is operator-only
    // wording that has to keep saying exactly what it says. A Nepali-speaking
    // operator gets this from the curated tables, which are reviewed — not from
    // a model guessing at triage terminology.
    <div className="pb-[var(--content-bottom)] sm:pb-16" data-no-translate>
      <PageHeader
        icon={ClipboardList}
        title={t('admin.title')}
        description={t('admin.subtitle')}
        actions={
          <Button
            variant="outline"
            size="lg"
            onClick={() => void load(filter)}
            disabled={loading}
          >
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden="true" />
            {t('admin.refresh')}
          </Button>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
            {t('admin.filter.all')}
          </FilterChip>
          {STATUS_ORDER.map((status) => (
            <FilterChip
              key={status}
              active={filter === status}
              onClick={() => setFilter(status)}
            >
              {label('adminStatus', status, status.replace('_', ' '))}
            </FilterChip>
          ))}
        </div>
      </PageHeader>

      <div className="container py-6 sm:py-8">
        <QueueStats stats={stats} />

        {errorKey && (
          <Notice tone="caution" icon={ShieldAlert} className="mb-4">
            {t(errorKey)}
          </Notice>
        )}

        {loading && <LoadingBlock label={t('admin.loading')} />}

        {!loading && tickets && tickets.length === 0 && (
          <Card className="p-8 text-center">
            <h2 className="text-base font-bold tracking-tight text-navy-900">
              {t('admin.empty.title')}
            </h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-navy-500">
              {t('admin.empty.body')}
            </p>
          </Card>
        )}

        {!loading && tickets && tickets.length > 0 && (
          <ul className="grid gap-3.5">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <QueueRow
                  ticket={ticket}
                  busy={busyId === ticket.id}
                  onAdvance={advance}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Queue counts from `GET /api/tickets/stats`.
 *
 * Not the dashboard's `StatCard`, which wants a `spark` trend array. There is no
 * honest way to produce one here: the counts are lifetime aggregates over a
 * table with no history, so any sparkline drawn on them would be invented
 * history on a responder's screen. A number and its label is what the data
 * actually supports.
 *
 * `by_support` deliberately does not sum to `total`, because a ticket with
 * three support types is counted in three classes. That is said out loud rather
 * than left to look like a bug - a responder who thinks the panel is lying stops
 * reading it.
 */
function QueueStats({ stats }: { stats: TicketStats | null }) {
  const { t, label } = useLocale();
  if (!stats) return null;

  const support = SUPPORT_TYPE_LIST.map((s) => [s.id, stats.by_support[s.id] ?? 0] as const)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <section aria-label={t('admin.stats.ariaLabel')} className="mb-5">
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <CountTile label={t('admin.stats.total')} value={stats.total} />
        {STATUS_ORDER.map((status) => (
          <CountTile
            key={status}
            label={label('adminStatus', status, status.replace('_', ' '))}
            value={stats.by_status[status] ?? 0}
          />
        ))}
      </div>

      {support.length > 0 && (
        <Card className="mt-3.5 p-4 sm:p-5">
          <Eyebrow as="h2">{t('admin.stats.supportTitle')}</Eyebrow>
          <ul className="mt-3 flex flex-wrap gap-2">
            {support.map(([id, n]) => (
              <li
                key={id}
                className="flex items-center gap-2 rounded-full bg-navy-50 px-3 py-1.5 text-2xs font-semibold text-navy-700"
              >
                {supportName(id, label)}
                <span className="nums font-mono font-bold text-navy-900">{n}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-2xs leading-relaxed text-navy-400">
            {t('admin.stats.supportFootnote')}
          </p>
        </Card>
      )}
    </section>
  );
}

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <Eyebrow>{label}</Eyebrow>
      <p className="nums mt-1.5 font-mono text-2xl font-extrabold text-navy-900">
        {value}
      </p>
    </Card>
  );
}

type LabelFn = (
  table: import('@/lib/i18n-strings').Table,
  id: string,
  english: string,
) => string;

function supportName(id: string, label: LabelFn): string {
  const meta = SUPPORT_TYPE_LIST.find((s) => s.id === id);
  return meta ? label('support', meta.id, meta.shortLabel) : id;
}

function QueueRow({
  ticket,
  busy,
  onAdvance,
}: {
  ticket: StoredTicket;
  busy: boolean;
  onAdvance: (ticket: StoredTicket, status: TicketStatus) => Promise<void>;
}) {
  const { t, label, locale } = useLocale();
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="nums font-mono text-xs font-bold text-navy-500">
              {ticket.id}
            </span>
            <TicketStatusBadge status={ticket.status} />
          </div>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-navy-900">
            {ticket.summary}
          </p>
          <p className="mt-1.5 text-2xs leading-relaxed text-navy-500">
            {label('ticketStatusDetail', ticket.status, ticketStatusDetail(ticket.status))}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-2.5 border-t border-navy-100 pt-3.5 text-xs sm:grid-cols-3">
        <Row
          label={t('admin.row.reporter')}
          value={`${ticket.reporter_name} · ${ticket.reporter_phone}`}
        />
        <Row label={t('admin.row.location')} value={ticket.location} />
        <Row
          label={t('admin.row.support')}
          value={supportLabel(ticket.support_needed, label)}
        />
        <Row
          label={t('admin.row.priority')}
          value={label(
            'priority',
            ticket.urgency,
            PRIORITIES[ticket.urgency]?.label ?? ticket.urgency,
          )}
        />
        <Row
          label={t('admin.row.people')}
          value={ticket.people_affected === null ? '—' : String(ticket.people_affected)}
        />
        <Row
          label={t('admin.row.filed')}
          value={formatDateTime(ticket.created_at, intlLocale(locale))}
        />
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-navy-100 pt-3.5">
        <Eyebrow as="span" className="mr-1">{t('admin.moveTo')}</Eyebrow>
        {STATUS_ORDER.map((status) => (
          <Button
            key={status}
            type="button"
            size="sm"
            variant={status === ticket.status ? 'primary' : 'outline'}
            disabled={busy || status === ticket.status}
            onClick={() => void onAdvance(ticket, status)}
          >
            {label('adminStatus', status, status.replace('_', ' '))}
          </Button>
        ))}
        {busy && (
          <span className="ml-1 flex items-center gap-1.5 text-2xs text-navy-500">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            {t('admin.saving')}
          </span>
        )}
      </div>

      {/* The spoken intake, for the person actually working this ticket.
          Collapsed by default here — in a queue it competes with every other
          row — and opened only on request, so nobody has to read a stranger's
          account of their worst hour in order to see a phone number.

          Fetched from the admin-scoped proxy on demand rather than listed in the
          queue response. A queue of 200 tickets would otherwise be 200
          transcripts' worth of someone's worst hour in memory, fetched for the
          two responders who open one. */}
      {ticket.source === 'voice' && (
        <div className="mt-3 border-t border-navy-100 pt-3.5">
          <AdminTranscript ticketId={ticket.id} />
        </div>
      )}
    </Card>
  );
}

/**
 * One ticket's transcript, fetched when a responder asks for it.
 *
 * A failed read is stated, never hidden. A responder deciding whether to call
 * someone has to be able to tell "there is no transcript" from "I could not load
 * it", and a component that renders nothing for both has taken that ability away.
 */
function AdminTranscript({ ticketId }: { ticketId: string }) {
  const { t } = useLocale();
  const [state, setState] = React.useState<
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ready'; turns: TranscriptTurn[] }
    | { status: 'error'; errorKey: string }
  >({ status: 'idle' });

  if (state.status === 'idle') {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setState({ status: 'loading' });
          void fetchAdminTranscript(ticketId).then((result) => {
            setState(
              result.ok
                ? { status: 'ready', turns: result.value.turns }
                : { status: 'error', errorKey: portalErrorKey(result.error) },
            );
          });
        }}
      >
        <Mic aria-hidden="true" />
        {t('admin.transcript.read')}
      </Button>
    );
  }

  if (state.status === 'loading') {
    return (
      <p className="flex items-center gap-2 text-2xs text-navy-500" role="status" aria-live="polite">
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        {t('transcript.loading')}
      </p>
    );
  }

  if (state.status === 'error') {
    return (
      <p role="alert" className="text-2xs font-semibold leading-relaxed text-alert-700">
        {t(state.errorKey)}
      </p>
    );
  }

  return (
    <TicketTranscriptView turns={state.turns} defaultOpen className="mt-1" />
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <Eyebrow as="dt">{label}</Eyebrow>
      <dd className="mt-0.5 break-words font-semibold text-navy-800">{value}</dd>
    </div>
  );
}

function supportLabel(types: SupportType[], label: LabelFn): string {
  return types
    .map((type) => {
      const meta = SUPPORT_TYPE_LIST.find((s) => s.id === type);
      return meta ? label('support', meta.id, meta.shortLabel) : type;
    })
    .join(', ');
}

/**
 * Which failure this is, as a key.
 *
 * The `forbidden` case gets its own sentence rather than `portalError`'s
 * "your account is not allowed to do that": on `/admin` the near-certain cause
 * is a missing `ADMIN_EMAILS` entry, and an operator reading a 403 needs to know
 * that rather than being told to contact someone.
 */
function queueErrorKey(kind: string): string {
  if (kind === 'forbidden') return 'admin.error.forbidden';
  if (kind === 'unreachable') return 'admin.error.unreachable';
  if (kind === 'unavailable') return 'admin.error.unavailable';
  return 'admin.error.unknown';
}
