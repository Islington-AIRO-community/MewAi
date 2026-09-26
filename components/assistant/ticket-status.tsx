'use client';

import { CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TicketStatus } from '@/lib/ai-client';

/**
 * Ticket lifecycle, as a reporter reads it.
 *
 * The backend's `TicketStatus` has five values because the operational side
 * needs to distinguish them. A person checking on a relative does not, and
 * "under_review" is a term for staff — it tells someone waiting for help
 * nothing except that they are still waiting.
 *
 * So this collapses five states into the three that answer the only question
 * the reporter actually has: has anyone looked at this, and is it done.
 *
 *   not reviewed yet  <- submitted
 *   in progress       <- under_review, dispatched
 *   completed         <- resolved, closed
 *
 * The two error paths are both surfaced, never folded into a neutral colour:
 * `submitted` means no human has touched it, and `dispatched` means someone is
 * on the way. Both need to be legible at a glance by someone who is stressed.
 */

export type TicketPhase = 'awaiting' | 'active' | 'done';

const PHASES: Record<TicketStatus, { phase: TicketPhase; label: string; detail: string }> = {
  submitted: {
    phase: 'awaiting',
    label: 'Not reviewed yet',
    detail: 'Received and waiting for a response team to look at it.',
  },
  under_review: {
    phase: 'active',
    label: 'In progress',
    detail: 'A response team is reviewing your request.',
  },
  dispatched: {
    phase: 'active',
    label: 'In progress — dispatched',
    detail: 'A unit has been dispatched to the location on this ticket.',
  },
  resolved: {
    phase: 'done',
    label: 'Completed',
    detail: 'The response for this ticket is finished.',
  },
  closed: {
    phase: 'done',
    label: 'Completed — closed',
    detail: 'This ticket has been closed.',
  },
};

export function ticketPhase(status: TicketStatus): TicketPhase {
  return PHASES[status]?.phase ?? 'awaiting';
}

export function ticketStatusLabel(status: TicketStatus): string {
  return PHASES[status]?.label ?? PHASES.submitted.label;
}

export function ticketStatusDetail(status: TicketStatus): string {
  return PHASES[status]?.detail ?? PHASES.submitted.detail;
}

const PHASE_STYLES: Record<TicketPhase, string> = {
  // `alert` rather than `emergency`: nothing here says someone is in danger
  // right now, and the two must not look alike.
  awaiting: 'bg-alert-50 text-alert-800 ring-alert-200',
  active: 'bg-dispatch-50 text-dispatch-800 ring-dispatch-200',
  done: 'bg-relief-50 text-relief-800 ring-relief-200',
};

const PHASE_ICONS: Record<TicketPhase, typeof Clock> = {
  awaiting: Clock,
  active: Loader2,
  done: CheckCircle2,
};

/**
 * Status pill.
 *
 * Icon plus text, always — the colour is the third signal, never the only one.
 */
export function TicketStatusBadge({
  status,
  className,
}: {
  status: TicketStatus;
  className?: string;
}) {
  const phase = ticketPhase(status);
  const Icon = PHASE_ICONS[phase];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-bold ring-1 ring-inset',
        PHASE_STYLES[phase],
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {ticketStatusLabel(status)}
    </span>
  );
}
