'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ChevronDown,
  FileText,
  KeyRound,
  Loader2,
  MapPin,
  Mic,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/primitives';
import { TicketStatusBadge } from '@/components/assistant/ticket-status';
import { SUPPORT_TYPE_LIST, type SupportType } from '@/lib/types';
import { useClaimTicket, useMyTickets } from '@/lib/ticket-portal';
import { formatDateTime } from '@/lib/time';

/**
 * "My tickets" — the durable half of the intake.
 *
 * The mirror of a ticket in `lib/store.tsx` disappears on refresh; the row in
 * Postgres does not. This page is the reconnect, and it is the first place in
 * the app where a reporter can see something they filed yesterday.
 *
 * Gated by `middleware.ts` on `/tickets/:path*`, and the API underneath it
 * resolves the same session, so a signed-out visitor is redirected rather than
 * shown an empty list that might be their own failure to load.
 *
 * A client component like every page but `app/layout.tsx` and `app/chat`, so it
 * cannot export `metadata`; the title comes from the root layout.
 */
export default function TicketsPage() {
  const { data, error, loading, reload } = useMyTickets();

  return (
    <div className="pb-32 sm:pb-16">
      <div className="border-b border-navy-200 bg-white">
        <div className="container py-7 sm:py-9">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-xl bg-navy-100 text-navy-700">
                  <FileText className="size-4.5" aria-hidden="true" />
                </span>
                <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">
                  My tickets
                </h1>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-navy-500">
                Everything you have asked us for, and where it has got to. Open one to
                check its status or add a message for the response team.
              </p>
            </div>

            <Button asChild variant="primary" size="lg" className="self-start lg:self-auto">
              <Link href="/chat">
                <Mic aria-hidden="true" />
                Raise a new ticket
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="container py-6 sm:py-8">
        {loading && <Loading />}
        {!loading && error && <Failure error={error} onRetry={reload} />}
        {!loading && !error && data && data.length === 0 && <Empty onClaimed={reload} />}
        {!loading && !error && data && data.length > 0 && (
          <>
            <ul className="grid gap-3.5">
              {data.map((ticket) => (
                <li key={ticket.id}>
                  <TicketRow ticket={ticket} />
                </li>
              ))}
            </ul>
            {/* Not only on an empty list: someone with two tracked tickets can
                still have a third they filed signed out, and this is the only
                way to reach it. */}
            <div className="mt-5">
              <ClaimForm onClaimed={reload} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TicketRow({ ticket }: { ticket: import('@/lib/ai-client').StoredTicket }) {
  return (
    <Card
      className="p-0 transition-shadow hover:shadow-card focus-within:shadow-card"
    >
      {/* Stretched link: the whole card is the target, and the reference stays
          readable underneath it. `focus-within` on the card carries the ring so
          keyboard users see where they are. */}
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="nums font-mono text-xs font-bold text-navy-500">
              {ticket.id}
            </span>
            <TicketStatusBadge status={ticket.status} />
          </div>

          <p className="mt-2 line-clamp-2 text-sm font-semibold leading-relaxed text-navy-900">
            {ticket.summary}
          </p>

          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-navy-500">
            <span className="flex items-center gap-1">
              <MapPin className="size-3 shrink-0" aria-hidden="true" />
              {ticket.location}
            </span>
            <span aria-hidden="true">·</span>
            <span>{supportLabel(ticket.support_needed)}</span>
            <span aria-hidden="true">·</span>
            <span className="nums">{formatDateTime(ticket.created_at)}</span>
          </p>
        </div>

        <Button asChild variant="outline" size="md" className="shrink-0 self-start sm:self-auto">
          <Link href={`/tickets/${ticket.id}`}>Open</Link>
        </Button>
      </div>
    </Card>
  );
}

function Empty({ onClaimed }: { onClaimed: () => void }) {
  return (
    <div className="grid gap-5">
      <Card className="p-8 text-center">
        <span
          className="mx-auto grid size-12 place-items-center rounded-2xl bg-navy-100 text-navy-500"
          aria-hidden="true"
        >
          <FileText className="size-6" />
        </span>
        <h2 className="mt-4 text-base font-bold tracking-tight text-navy-900">
          No tickets yet
        </h2>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-navy-500">
          Nothing is attached to this account. If you asked for help, it is saved
          either way — the response team has your name, number and location.
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-navy-500">
          A ticket you filed <em className="not-italic font-semibold text-navy-700">without
          signing in</em> does not show up here on its own. Add it with the
          reference we gave you and the phone number you gave us.
        </p>
        <Button asChild variant="primary" size="lg" className="mt-5">
          <Link href="/chat">Ask for help</Link>
        </Button>
      </Card>
      <ClaimForm onClaimed={onClaimed} />
    </div>
  );
}

/**
 * Attach a ticket that was filed while signed out.
 *
 * Anonymous intake means a real ticket exists with nobody attached to it, and
 * without this the reporter has a reference code and no way to use it. The proof
 * is that same code plus the phone number they gave when they filed, which is
 * why the second field asks for a number they already know rather than an email
 * or a code sent to a device they may no longer have.
 *
 * Collapsed by default. A reporter who has never filed signed out should not be
 * asked about it, and the empty state already points at it.
 */
function ClaimForm({ onClaimed }: { onClaimed: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [ticketId, setTicketId] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const { claiming, error, clearError, claim } = useClaimTicket(onClaimed);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const ok = await claim(ticketId, phone);
    // Only wipe the fields on success. Clearing them on failure would destroy
    // the reference the reporter just retyped, which during a disaster is
    // exactly the string they are least able to reproduce.
    if (ok) {
      setTicketId('');
      setPhone('');
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-navy-300 bg-navy-50/60 px-4 py-3.5 text-sm font-semibold text-navy-600 no-tap-highlight transition-colors hover:border-navy-400 hover:bg-navy-50"
      >
        <KeyRound className="size-4 shrink-0" aria-hidden="true" />
        I filed this while signed out
        <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
      </button>
    );
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-base font-bold tracking-tight text-navy-900">
        Add a ticket you filed without signing in
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-navy-500">
        Your ticket was saved and the response team has it. To follow it here,
        give us the reference from your receipt and the phone number you gave us.
      </p>

      <form onSubmit={onSubmit} className="mt-4 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="claim-ticket-id">Ticket reference</Label>
            <input
              id="claim-ticket-id"
              value={ticketId}
              onChange={(e) => {
                setTicketId(e.target.value);
                if (error) clearError();
              }}
              placeholder="TKT-000001"
              autoComplete="off"
              spellCheck={false}
              /* 16px minimum: anything smaller makes iOS zoom the viewport on
                 focus, which loses the reference mid-typing. */
              className="mt-1.5 h-11 w-full rounded-lg border border-navy-200 bg-white px-3 text-base text-navy-900 placeholder:text-navy-400 focus-visible:border-dispatch-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600/30"
            />
          </div>
          <div>
            <Label htmlFor="claim-phone">Phone number you gave us</Label>
            <input
              id="claim-phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (error) clearError();
              }}
              placeholder="07700 900123"
              autoComplete="tel"
              className="mt-1.5 h-11 w-full rounded-lg border border-navy-200 bg-white px-3 text-base text-navy-900 placeholder:text-navy-400 focus-visible:border-dispatch-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600/30"
            />
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-alert-50 px-3 py-2.5 text-sm leading-relaxed text-alert-700 ring-1 ring-inset ring-alert-200"
          >
            <AlertCircle className="mt-px size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={claiming || ticketId.trim().length === 0 || phone.trim().length < 6}
          >
            {claiming ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Checking
              </>
            ) : (
              'Add this ticket'
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={() => {
              setOpen(false);
              clearError();
            }}
          >
            Cancel
          </Button>
        </div>

        <p className="text-2xs leading-relaxed text-navy-500">
          Both details must match the ticket exactly. If the ticket has already
          been added to an account, it can only be used from that account — there
          is no way to move it, so nobody else can take it from you.
        </p>
      </form>
    </Card>
  );
}

function Failure({
  error,
  onRetry,
}: {
  error: NonNullable<ReturnType<typeof useMyTickets>['error']>;
  onRetry: () => void;
}) {
  return (
    <Card className="p-8 text-center">
      <span
        className="mx-auto grid size-12 place-items-center rounded-2xl bg-alert-50 text-alert-600 ring-1 ring-inset ring-alert-200"
        aria-hidden="true"
      >
        <AlertCircle className="size-6" />
      </span>
      <h2 className="mt-4 text-base font-bold tracking-tight text-navy-900">
        {error.kind === 'not_signed_in' ? 'Sign in to see your tickets' : 'Cannot load your tickets'}
      </h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-navy-500">
        {error.kind === 'not_signed_in'
          ? 'Tickets are tied to the account you were signed in with when you filed them.'
          : 'Nothing was lost. Try again in a moment.'}
      </p>
      {error.kind === 'not_signed_in' ? (
        <Button asChild variant="primary" size="lg" className="mt-5">
          <Link href="/login?callbackUrl=/tickets">Sign in</Link>
        </Button>
      ) : (
        <Button variant="outline" size="lg" className="mt-5" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
      )}
    </Card>
  );
}

function Loading() {
  return (
    <div
      className="flex items-center justify-center gap-2 py-16 text-sm text-navy-500"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      Loading your tickets…
    </div>
  );
}

function supportLabel(types: SupportType[]): string {
  return types
    .map((t) => SUPPORT_TYPE_LIST.find((s) => s.id === t)?.shortLabel ?? t)
    .join(', ');
}
