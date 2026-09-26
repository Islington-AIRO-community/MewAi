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
import { useTicketConversation, type PortalMessage } from '@/lib/ticket-portal';
import { formatDateTime } from '@/lib/time';

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
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const { ticket, messages, error, loading, sending, degraded, send } =
    useTicketConversation(id ?? '');

  const [query, setQuery] = React.useState('');
  const listRef = React.useRef<HTMLUListElement>(null);

  // Keep the newest turn in view. A follow-up thread is read from the bottom.
  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  if (!id) return <Frame><Missing /></Frame>;

  if (loading) {
    return (
      <Frame>
        <p
          className="flex items-center justify-center gap-2 py-20 text-sm text-navy-500"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Opening your ticket…
        </p>
      </Frame>
    );
  }

  if (error || !ticket) {
    return (
      <Frame>
        <Card className="p-8 text-center">
          <span
            className="mx-auto grid size-12 place-items-center rounded-2xl bg-alert-50 text-alert-600 ring-1 ring-inset ring-alert-200"
            aria-hidden="true"
          >
            <AlertCircle className="size-6" />
          </span>
          <h1 className="mt-4 text-lg font-bold tracking-tight text-navy-900">
            {error?.kind === 'not_signed_in'
              ? 'Sign in to see this ticket'
              : 'Ticket not found'}
          </h1>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-navy-500">
            {error?.kind === 'not_signed_in'
              ? 'A ticket can only be opened by the account it was filed with.'
              : 'No ticket with that reference is on your account. If you filed it while signed out it cannot be reopened here — quote the reference to any team that reaches you.'}
          </p>
          <Button asChild variant="outline" size="lg" className="mt-5">
            <Link href="/tickets">
              <ArrowLeft aria-hidden="true" />
              All my tickets
            </Link>
          </Button>
        </Card>
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
          {ticketStatusDetail(ticket.status)}
        </p>

        <dl className="mt-5 grid gap-x-6 gap-y-3 border-t border-navy-100 pt-4 sm:grid-cols-2">
          <Fact icon={MapPin} label="Location" value={ticket.location} />
          <Fact
            icon={Clock}
            label="Filed"
            value={formatDateTime(ticket.created_at)}
          />
          <Fact
            label="Support needed"
            value={ticket.support_needed
              .map((t) => SUPPORT_TYPE_LIST.find((s) => s.id === t)?.shortLabel ?? t)
              .join(', ')}
          />
          <Fact
            icon={Users}
            label="People affected"
            value={
              ticket.people_affected === null
                ? 'Not recorded'
                : String(ticket.people_affected)
            }
          />
          <Fact
            label="Priority"
            value={PRIORITIES[ticket.urgency]?.label ?? ticket.urgency}
          />
          <Fact
            label="Contact number"
            value={ticket.reporter_phone}
            mono
          />
        </dl>
      </Card>

      {/* Conversation. */}
      <Card className="p-0">
        <h2 className="border-b border-navy-100 px-5 py-3.5 text-sm font-bold tracking-tight text-navy-900">
          Messages about this ticket
        </h2>

        {degraded && (
          <p className="flex items-start gap-2 border-b border-alert-200 bg-alert-50 px-5 py-2.5 text-xs font-semibold leading-relaxed text-alert-800">
            <WifiOff className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>
              That answer came from the offline set — the live assistant was
              unreachable. Your message was still added to the ticket.
            </span>
          </p>
        )}

        {messages.length === 0 ? (
          <p className="px-5 py-6 text-sm leading-relaxed text-navy-500">
            No messages yet. Anything you add here goes to the response team working
            on this ticket.
          </p>
        ) : (
          <ul ref={listRef} className="max-h-[26rem] space-y-3 overflow-y-auto px-5 py-4">
            {messages.map((message) => (
              <li key={message.id}>
                <Bubble message={message} />
              </li>
            ))}
            {sending && (
              <li className="flex items-center gap-2 text-2xs text-navy-400">
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                <span role="status" aria-live="polite">
                  The assistant is replying…
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
            Add a message about this ticket
          </label>
          <textarea
            id="follow-up"
            rows={2}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ask a question, or add something that changed…"
            className="min-h-11 flex-1 resize-none rounded-xl border border-navy-200 bg-white px-3 py-2.5 text-base leading-relaxed text-navy-900 placeholder:text-navy-400 focus:border-dispatch-400 focus:outline-none focus:ring-2 focus:ring-dispatch-200"
          />
          <Button type="submit" size="md" disabled={!query.trim() || sending}>
            <Send aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Send</span>
          </Button>
        </form>
      </Card>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-32 sm:pb-16">
      <div className="border-b border-navy-200 bg-white">
        <div className="container py-5">
          <Button asChild variant="ghost" size="sm">
            <Link href="/tickets">
              <ArrowLeft aria-hidden="true" />
              My tickets
            </Link>
          </Button>
        </div>
      </div>
      <div className="container grid max-w-3xl gap-4 py-6 sm:py-8">{children}</div>
    </div>
  );
}

function Missing() {
  return (
    <Card className="p-8 text-center">
      <h1 className="text-lg font-bold tracking-tight text-navy-900">No ticket selected</h1>
      <Button asChild variant="outline" size="lg" className="mt-5">
        <Link href="/tickets">All my tickets</Link>
      </Button>
    </Card>
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
      <dt className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-[0.06em] text-navy-400">
        {Icon && <Icon className="size-3 shrink-0" aria-hidden="true" />}
        {label}
      </dt>
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
          message.failed && 'ring-1 ring-inset ring-alert-400',
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
          <p className="mt-1 text-2xs opacity-80">Sending…</p>
        )}
        {message.failed && (
          <p className="mt-1.5 flex items-start gap-1 text-2xs font-semibold text-white">
            <AlertCircle className="mt-px size-3 shrink-0" aria-hidden="true" />
            {message.failed}
          </p>
        )}
      </div>
    </div>
  );
}
