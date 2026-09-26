'use client';

import * as React from 'react';
import { AlertCircle, ClipboardList, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  TicketStatusBadge,
  ticketStatusDetail,
} from '@/components/assistant/ticket-status';
import { PRIORITIES, SUPPORT_TYPE_LIST, type SupportType } from '@/lib/types';
import { fetchAdminQueue, setTicketStatus } from '@/lib/ticket-portal';
import { formatDateTime } from '@/lib/time';
import type { StoredTicket, TicketStatus } from '@/lib/ai-client';
import { cn } from '@/lib/utils';

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
  const [tickets, setTickets] = React.useState<StoredTicket[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<TicketStatus | 'all'>('all');
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async (status: TicketStatus | 'all') => {
    setLoading(true);
    const result = await fetchAdminQueue(status === 'all' ? undefined : status);
    if (result.ok) {
      setTickets(result.value.tickets);
      setError(null);
    } else {
      setTickets(null);
      setError(describe(result.error.kind));
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load(filter);
  }, [filter, load]);

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
      return;
    }
    setError(describe(result.error.kind));
  };

  return (
    <div className="pb-32 sm:pb-16">
      <div className="border-b border-navy-200 bg-white">
        <div className="container py-7 sm:py-9">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-xl bg-navy-100 text-navy-700">
                  <ClipboardList className="size-4.5" aria-hidden="true" />
                </span>
                <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">
                  Response queue
                </h1>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-navy-500">
                Every ticket filed through the assistant, oldest status first. Moving
                one here is what a reporter sees on their portal.
              </p>
            </div>

            <Button
              variant="outline"
              size="lg"
              onClick={() => void load(filter)}
              disabled={loading}
            >
              <RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden="true" />
              Refresh
            </Button>
          </div>

          <div className="mt-5 flex flex-wrap gap-1.5">
            <FilterChip
              active={filter === 'all'}
              onClick={() => setFilter('all')}
              label="All"
            />
            {STATUS_ORDER.map((status) => (
              <FilterChip
                key={status}
                active={filter === status}
                onClick={() => setFilter(status)}
                label={status.replace('_', ' ')}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="container py-6 sm:py-8">
        {error && (
          <p className="mb-4 flex items-start gap-2 rounded-xl border border-alert-200 bg-alert-50 px-3.5 py-2.5 text-xs font-semibold leading-relaxed text-alert-800">
            <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}

        {loading && (
          <p
            className="flex items-center justify-center gap-2 py-16 text-sm text-navy-500"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading the queue…
          </p>
        )}

        {!loading && tickets && tickets.length === 0 && (
          <Card className="p-8 text-center">
            <h2 className="text-base font-bold tracking-tight text-navy-900">
              Nothing in the queue
            </h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-navy-500">
              Tickets appear here as soon as they are filed.
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

function QueueRow({
  ticket,
  busy,
  onAdvance,
}: {
  ticket: StoredTicket;
  busy: boolean;
  onAdvance: (ticket: StoredTicket, status: TicketStatus) => Promise<void>;
}) {
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
            {ticketStatusDetail(ticket.status)}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-2.5 border-t border-navy-100 pt-3.5 text-xs sm:grid-cols-3">
        <Row label="Reporter" value={`${ticket.reporter_name} · ${ticket.reporter_phone}`} />
        <Row label="Location" value={ticket.location} />
        <Row label="Support" value={supportLabel(ticket.support_needed)} />
        <Row
          label="Priority"
          value={PRIORITIES[ticket.urgency]?.label ?? ticket.urgency}
        />
        <Row
          label="People"
          value={ticket.people_affected === null ? '—' : String(ticket.people_affected)}
        />
        <Row label="Filed" value={formatDateTime(ticket.created_at)} />
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-navy-100 pt-3.5">
        <span className="mr-1 text-2xs font-bold uppercase tracking-[0.06em] text-navy-400">
          Move to
        </span>
        {STATUS_ORDER.map((status) => (
          <Button
            key={status}
            type="button"
            size="sm"
            variant={status === ticket.status ? 'primary' : 'outline'}
            disabled={busy || status === ticket.status}
            onClick={() => void onAdvance(ticket, status)}
          >
            {status.replace('_', ' ')}
          </Button>
        ))}
        {busy && (
          <span className="ml-1 flex items-center gap-1.5 text-2xs text-navy-500">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            Saving…
          </span>
        )}
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs font-bold uppercase tracking-[0.06em] text-navy-400">
        {label}
      </dt>
      <dd className="mt-0.5 break-words font-semibold text-navy-800">{value}</dd>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full px-3 py-1.5 text-2xs font-bold capitalize transition-colors',
        active
          ? 'bg-navy-900 text-white'
          : 'bg-navy-100 text-navy-600 hover:bg-navy-200',
      )}
    >
      {label}
    </button>
  );
}

function supportLabel(types: SupportType[]): string {
  return types
    .map((t) => SUPPORT_TYPE_LIST.find((s) => s.id === t)?.shortLabel ?? t)
    .join(', ');
}

function describe(kind: string): string {
  if (kind === 'forbidden') {
    return 'Your account is not on the admin allowlist. Set ADMIN_EMAILS to include it.';
  }
  if (kind === 'unreachable') return 'The relief service could not be reached.';
  if (kind === 'unavailable') return 'The ticket database is down. Nothing was changed.';
  return 'Something went wrong loading the queue.';
}
