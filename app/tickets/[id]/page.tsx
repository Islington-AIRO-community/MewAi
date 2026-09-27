'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Clock,
  Loader2,
  MapPin,
  PhoneCall,
  Send,
  Users,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  TicketStatusBadge,
  ticketStatusDetail,
} from '@/components/assistant/ticket-status';
import { PRIORITIES, SUPPORT_TYPE_LIST } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useTicketConversation, useTicketTranscript, type PortalMessage } from '@/lib/ticket-portal';
import { TicketTranscriptView } from '@/components/assistant/ticket-transcript';
import { formatDateTime } from '@/lib/time';
import { Eyebrow } from '@/components/ui/primitives';
import { LoadingBlock, StateCard } from '@/components/ui/patterns';
import { intlLocale } from '@/lib/i18n-strings';
import { useLocale } from '@/lib/i18n';

/**
 * One ticket, and the conversation attached to it.
 *
 * The second half of the intake contract. Filing a ticket gets help moving; this
 * page is for afterwards, when the person is asking "has anyone seen this yet"
 * and nobody knows. It is deliberately a *status* first and a conversation
 * second, because the status is what they came for.
 *
 * The assistant here is handed the ticket and asked what it means. It is never
 * asked what the status is — that is read from the row on every render. See
 * `ai-backend/app/follow_up_prompts.py` for why this is a separate code path and
 * not the intake prompt behind a flag.
 *
 * A client component, so `id` comes from `useParams()` and this file cannot
 * export `metadata` or `generateStaticParams`. That is also why a ticket that is
 * not on the account renders an in-page state rather than `notFound()`.
 */
export default function TicketPortalPage() {
  const { t, label, locale } = useLocale();
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const { ticket, messages, error, loading, sending, degraded, send } =
    useTicketConversation(id ?? '');
  // Fetched separately and deliberately not awaited with the ticket: the page
  // must render a reporter's ticket even when the transcript read is slow or
  // briefly fails. A record of how the ticket was taken is not the ticket.
  const transcript = useTicketTranscript(id ?? '');

  const [query, setQuery] = React.useState('');
  const listRef = React.useRef<HTMLUListElement>(null);

  // Keep the newest turn in view. A follow-up thread is read from the bottom.
  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  if (loading) {
    return (
      <Frame>
        <LoadingBlock label={t('ticket.opening')} className="py-20" />
      </Frame>
    );
  }

  if (error || !ticket) {
    const signedOut = error?.kind === 'not_signed_in';
    return (
      <Frame>
        <StateCard
          icon={AlertCircle}
          tone="alert"
          titleAs="h1"
          title={t(signedOut ? 'ticket.signedIn.title' : 'ticket.missing.title')}
          action={
            /* The copy above promises a way back in, so one has to exist. The
               callback returns the reporter to this exact ticket, not the list. */
            signedOut ? (
              <Button asChild variant="primary" size="lg">
                <Link href={`/login?callbackUrl=/tickets/${id}`}>
                  {t('ticket.signedIn.cta')}
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline" size="lg">
                <Link href="/tickets">
                  <ArrowLeft aria-hidden="true" />
                  {t('ticket.missing.cta')}
                </Link>
              </Button>
            )
          }
          className="p-8"
        >
          {t(signedOut ? 'ticket.signedIn.body' : 'ticket.missing.body')}
        </StateCard>
      </Frame>
    );
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = query.trim();
    if (!text || sending) return;
    setQuery('');
    await send(text);
  };

  return (
    <Frame>
      {/* Status first — this is what the person came for. */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="nums font-mono text-xs font-bold text-navy-500">{ticket.id}</p>
            <h1 className="mt-1.5 text-xl font-extrabold tracking-tight text-navy-900 sm:text-2xl">
              {ticket.summary}
            </h1>
          </div>
          <TicketStatusBadge status={ticket.status} className="shrink-0" />
        </div>

        <p className="mt-3 text-sm leading-relaxed text-navy-600">
          {label('ticketStatusDetail', ticket.status, ticketStatusDetail(ticket.status))}
        </p>

        {/* `data-no-translate`: the facts block is the reporter's phone number
            and address. Prose is what this feature is for; a phone number is
            data, and a model that re-renders one is a call to the wrong
            household. */}
        <dl
          className="mt-5 grid gap-x-6 gap-y-3 border-t border-navy-100 pt-4 sm:grid-cols-2"
          data-no-translate
        >
          <Fact icon={MapPin} label={t('ticket.fact.location')} value={ticket.location} />
          <Fact
            icon={Clock}
            label={t('ticket.fact.filed')}
            value={formatDateTime(ticket.created_at, intlLocale(locale))}
          />
          <Fact
            label={t('ticket.fact.support')}
            value={ticket.support_needed
              .map((type) => {
                const meta = SUPPORT_TYPE_LIST.find((s) => s.id === type);
                return meta ? label('support', meta.id, meta.shortLabel) : type;
              })
              .join(', ')}
          />
          <Fact
            icon={Users}
            label={t('ticket.fact.people')}
            value={
              ticket.people_affected === null
                ? t('ticket.fact.notRecorded')
                : String(ticket.people_affected)
            }
          />
          <Fact
            label={t('ticket.fact.priority')}
            value={label(
              'priority',
              ticket.urgency,
              PRIORITIES[ticket.urgency]?.label ?? ticket.urgency,
            )}
          />
          <Fact
            label={t('ticket.fact.contact')}
            value={ticket.reporter_phone}
            mono
          />
        </dl>
      </Card>

      {/* Spoken intake. Placed above the conversation because it is the earlier
          record: this is what was said to get the ticket filed, and the
          conversation below is what has happened since. */}
      <Card className="p-5 sm:p-6">
        <TicketTranscriptView
          turns={transcript.data ?? []}
          loading={transcript.loading}
          error={
            transcript.error && transcript.error.kind !== 'not_signed_in'
              ? transcript.error.kind === 'unavailable'
                ? t('ticket.transcript.unavailable')
                : t('ticket.transcript.failed')
              : null
          }
          emptyHintKey="transcript.reporterHint"
        />
      </Card>

      {/* Conversation. */}
      <Card className="p-0">
        <h2 className="border-b border-navy-100 px-5 py-3.5 text-sm font-bold tracking-tight text-navy-900">
          {t('ticket.messages.title')}
        </h2>

        {degraded && (
          <p className="flex items-start gap-2 border-b border-alert-200 bg-alert-50 px-5 py-2.5 text-xs font-semibold leading-relaxed text-alert-800">
            <WifiOff className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>{t('ticket.messages.degraded')}</span>
          </p>
        )}

        {/* `data-no-translate` on the thread below: it is the record of what was
            said, by the reporter and by the response team. Rewriting either side
            of it changes what a responder would later read as having been said. */}
        {messages.length === 0 ? (
          <p className="px-5 py-6 text-sm leading-relaxed text-navy-500">
            {t('ticket.messages.empty')}
          </p>
        ) : (
          <ul
            ref={listRef}
            className="max-h-[26rem] space-y-3 overflow-y-auto px-5 py-4"
            data-no-translate
          >
            {messages.map((message) => (
              <li key={message.id}>
                <Bubble message={message} />
              </li>
            ))}
            {sending && (
              <li className="flex items-center gap-2 text-2xs text-navy-400">
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                <span role="status" aria-live="polite">
                  {t('ticket.messages.replying')}
                </span>
              </li>
            )}
          </ul>
        )}

        <form
          onSubmit={onSubmit}
          className="flex items-end gap-2 border-t border-navy-100 bg-navy-50/50 px-4 py-3"
        >
          <label htmlFor="follow-up" className="sr-only">
            {t('ticket.messages.inputAria')}
          </label>
          <textarea
            id="follow-up"
            rows={2}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('ticket.messages.inputPlaceholder')}
            className="min-h-11 flex-1 resize-none rounded-xl border border-navy-200 bg-white px-3 py-2.5 text-base leading-relaxed text-navy-900 placeholder:text-navy-400 focus:border-dispatch-400 focus:outline-none focus:ring-2 focus:ring-dispatch-200"
          />
          <Button type="submit" size="md" disabled={!query.trim() || sending}>
            <Send aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">{t('ticket.messages.send')}</span>
          </Button>
        </form>
      </Card>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();
  return (
    <div className="pb-32 sm:pb-16">
      <div className="border-b border-navy-200 bg-white">
        <div className="container py-5">
          <Button asChild variant="ghost" size="sm">
            <Link href="/tickets">
              <ArrowLeft aria-hidden="true" />
              {t('tickets.title')}
            </Link>
          </Button>
        </div>
      </div>
      <div className="container grid max-w-3xl gap-4 py-6 sm:py-8">{children}</div>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon?: typeof MapPin;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <Eyebrow as="dt" className="flex items-center gap-1.5">
        {Icon && <Icon className="size-3 shrink-0" aria-hidden="true" />}
        {label}
      </Eyebrow>
      <dd
        className={cn(
          'mt-0.5 break-words text-sm font-semibold text-navy-800',
          mono && 'font-mono text-xs',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Bubble({ message }: { message: PortalMessage }) {
  const { t } = useLocale();
  const mine = message.role === 'user';
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed sm:max-w-[75%]',
          mine
            ? 'bg-dispatch-500 text-white'
            : 'border border-navy-200 bg-white text-navy-800',
          message.pending && 'opacity-60',
          message.failedKey && 'ring-1 ring-inset ring-alert-400',
        )}
      >
        {message.safetyNote && (
          <p className="mb-2 flex items-start gap-1.5 rounded-lg bg-emergency-50 px-2 py-1.5 text-2xs font-bold leading-relaxed text-emergency-800 stripe-alert">
            <PhoneCall className="mt-px size-3 shrink-0" aria-hidden="true" />
            {message.safetyNote}
          </p>
        )}
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
        {message.pending && (
          <p className="mt-1 text-2xs opacity-80">{t('ticket.messages.sending')}</p>
        )}
        {message.failedKey && (
          <p className="mt-1.5 flex items-start gap-1 text-2xs font-semibold text-white">
            <AlertCircle className="mt-px size-3 shrink-0" aria-hidden="true" />
            {t(message.failedKey)}
          </p>
        )}
      </div>
    </div>
  );
}
