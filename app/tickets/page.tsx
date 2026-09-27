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
import { LoadingBlock, Notice, PageHeader, StateCard } from '@/components/ui/patterns';
import { TextField } from '@/components/ui/inputs';
import { TicketStatusBadge } from '@/components/assistant/ticket-status';
import { SUPPORT_TYPE_LIST, type SupportType } from '@/lib/types';
import { useClaimTicket, useMyTickets } from '@/lib/ticket-portal';
import { formatDateTime } from '@/lib/time';
import { intlLocale } from '@/lib/i18n-strings';
import { useLocale } from '@/lib/i18n';

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
  const { t } = useLocale();

  return (
    <div className="pb-[var(--content-bottom)] sm:pb-16">
      <PageHeader
        icon={FileText}
        title={t('tickets.title')}
        description={t('tickets.subtitle')}
        actions={
          <Button asChild variant="primary" size="lg" className="self-start lg:self-auto">
            <Link href="/chat">
              <Mic aria-hidden="true" />
              {t('tickets.newCta')}
            </Link>
          </Button>
        }
      />

      <div className="container py-6 sm:py-8">
        {loading && <LoadingBlock label={t('tickets.loading')} />}
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
  const { t, label, locale } = useLocale();
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
            <span>{supportLabel(ticket.support_needed, label)}</span>
            <span aria-hidden="true">·</span>
            <span className="nums">
              {formatDateTime(ticket.created_at, intlLocale(locale))}
            </span>
          </p>
        </div>

        <Button asChild variant="outline" size="md" className="shrink-0 self-start sm:self-auto">
          <Link href={`/tickets/${ticket.id}`}>{t('tickets.open')}</Link>
        </Button>
      </div>
    </Card>
  );
}

function Empty({ onClaimed }: { onClaimed: () => void }) {
  const { t } = useLocale();
  return (
    <div className="grid gap-5">
      <StateCard
        icon={FileText}
        title={t('tickets.empty')}
        action={
          <Button asChild variant="primary" size="lg">
            <Link href="/chat">{t('tickets.emptyCta')}</Link>
          </Button>
        }
      >
        <p>{t('tickets.emptyBody')}</p>
        <p className="mt-2">
          {t('tickets.emptyClaimBefore')}{' '}
          <em className="not-italic font-semibold text-navy-700">
            {t('tickets.emptyClaimEmphasis')}
          </em>{' '}
          {t('tickets.emptyClaimAfter')}
        </p>
      </StateCard>
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
  const { t } = useLocale();
  const [open, setOpen] = React.useState(false);
  const [ticketId, setTicketId] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const { claiming, errorKey, clearError, claim } = useClaimTicket(onClaimed);

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
        {t('claim.collapsed')}
        <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
      </button>
    );
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-base font-bold tracking-tight text-navy-900">
        {t('claim.title')}
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-navy-500">
        {t('claim.body')}
      </p>

      <form onSubmit={onSubmit} className="mt-4 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="claim-ticket-id"
            label={t('claim.reference')}
            value={ticketId}
            onChange={(e) => {
              setTicketId(e.target.value);
              if (errorKey) clearError();
            }}
            placeholder="TKT-000001"
            autoComplete="off"
            spellCheck={false}
          />
          <TextField
            id="claim-phone"
            type="tel"
            inputMode="tel"
            label={t('claim.phone')}
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              if (errorKey) clearError();
            }}
            placeholder="07700 900123"
            autoComplete="tel"
          />
        </div>

        {errorKey && (
          <Notice tone="caution" icon={AlertCircle} role="alert">
            {t(errorKey)}
          </Notice>
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
                {t('claim.checking')}
              </>
            ) : (
              t('claim.submit')
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
            {t('claim.cancel')}
          </Button>
        </div>

        <p className="text-2xs leading-relaxed text-navy-500">{t('claim.footnote')}</p>
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
  const { t } = useLocale();
  const signedOut = error.kind === 'not_signed_in';
  return (
    <StateCard
      icon={AlertCircle}
      tone="alert"
      title={t(signedOut ? 'tickets.failure.signedIn.title' : 'tickets.failure.title')}
      action={
        signedOut ? (
          <Button asChild variant="primary" size="lg">
            <Link href="/login?callbackUrl=/tickets">{t('account.signIn')}</Link>
          </Button>
        ) : (
          <Button variant="outline" size="lg" onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            {t('tickets.failure.retry')}
          </Button>
        )
      }
    >
      {t(signedOut ? 'tickets.failure.signedIn.body' : 'tickets.failure.body')}
    </StateCard>
  );
}

function supportLabel(
  types: SupportType[],
  label: (table: import('@/lib/i18n-strings').Table, id: string, english: string) => string,
): string {
  return types
    .map((type) => {
      const meta = SUPPORT_TYPE_LIST.find((s) => s.id === type);
      return meta ? label('support', meta.id, meta.shortLabel) : type;
    })
    .join(', ');
}
