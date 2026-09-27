'use client';

import * as React from 'react';
import { Mic } from 'lucide-react';
import type { TranscriptTurn } from '@/lib/ticket-portal';
import { cn } from '@/lib/utils';
import { Notice } from '@/components/ui/patterns';
import { useLocale } from '@/lib/i18n';

/**
 * A filed ticket's spoken intake.
 *
 * Shared by the reporter's ticket page and the admin queue, because it is the
 * same words read by the same two audiences with one thing differing — who is
 * allowed to be here — and a transcript that renders differently per reader is a
 * transcript nobody can trust to say the same thing twice.
 *
 * The empty case is a fact, not an absence. `turns: []` means the ticket was
 * typed rather than spoken, and it is worded that way. Rendering it as an error,
 * or as a blank card, would suggest something is missing from the record when
 * nothing is.
 *
 * Not collapsed by default on the reporter's side. Someone who spoke a phone
 * number into a live session and is now looking at a ticket they filed is
 * plausibly checking that number, and a disclosure triangle puts one tap and a
 * glance between them and the answer. On `/admin` it *is* collapsed, because
 * there it competes with a queue.
 */
export function TicketTranscriptView({
  turns,
  loading = false,
  error = null,
  defaultOpen = true,
  className,
  emptyHintKey,
}: {
  turns: TranscriptTurn[];
  loading?: boolean;
  error?: string | null;
  defaultOpen?: boolean;
  className?: string;
  /**
   * Extra wording on the reporter's side, where the audience is one person.
   * A **key**, not a sentence: this component is shared by `/tickets/[id]` and
   * `/admin`, and copy passed in from a caller would arrive untranslated.
   */
  emptyHintKey?: string;
}) {
  const { t } = useLocale();
  const [open, setOpen] = React.useState(defaultOpen);

  if (error) {
    return (
      <section className={className} aria-label={t('transcript.ariaLabel')}>
        <Notice tone="caution" role="status">
          {error}
        </Notice>
      </section>
    );
  }

  if (loading) {
    return (
      <section className={className} aria-label={t('transcript.ariaLabel')}>
        <p role="status" aria-live="polite" className="px-1 text-xs text-navy-400">
          {t('transcript.loading')}
        </p>
      </section>
    );
  }

  if (turns.length === 0) {
    return (
      <section className={className} aria-label={t('transcript.ariaLabel')}>
        <p className="flex items-start gap-2 rounded-xl bg-navy-50/70 px-4 py-3 text-xs leading-relaxed text-navy-500 ring-1 ring-inset ring-navy-200">
          <Mic className="mt-px size-3.5 shrink-0 text-navy-400" aria-hidden="true" />
          <span>
            {t('transcript.typed')}
            {emptyHintKey ? ` ${t(emptyHintKey)}` : ''}
          </span>
        </p>
      </section>
    );
  }

  return (
    <section className={className} aria-label={t('transcript.ariaLabel')}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-1 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-bold tracking-tight text-navy-900">
          <Mic className="size-4 text-dispatch-600" aria-hidden="true" />
          {t('transcript.title')}
        </span>
        <span className="nums shrink-0 rounded px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide bg-navy-100 text-navy-500">
          {t(turns.length === 1 ? 'transcript.turn' : 'transcript.turns', { n: turns.length })}
        </span>
      </button>

      {/* `data-no-translate` on the list below: this is the spoken intake,
          verbatim — the same turns that justified the ticket. It is shown here
          as evidence of what was said, and a model paraphrasing it is editing
          the evidence. The title, the turn count and the empty/loading states
          are curated and are translated. */}
      {open && (
        <ol
          className="mt-2 max-h-80 space-y-2 overflow-y-auto overscroll-contain pr-1"
          data-no-translate
        >
          {turns.map((turn) => (
            // `seq` is assigned by the database and unique per ticket, so it is
            // a real identity here — unlike the review form's live buffer, which
            // is re-rendered on every transcription chunk.
            <li
              key={turn.seq}
              className={cn(
                'rounded-xl px-3 py-2 text-xs leading-relaxed',
                turn.role === 'reporter'
                  ? 'bg-white text-navy-800 ring-1 ring-inset ring-navy-200'
                  : 'bg-dispatch-50 text-navy-700 ring-1 ring-inset ring-dispatch-200',
              )}
            >
              <span className="font-bold">
                {t(turn.role === 'reporter' ? 'transcript.reporter' : 'transcript.assistant')}
              </span>{' '}
              {turn.text}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
