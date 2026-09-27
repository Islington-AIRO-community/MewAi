'use client';

import * as React from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Info,
  MapPin,
  Pencil,
  Phone,
  Send,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import type { SlotName } from '@/lib/ai-client';
import {
  ALWAYS_REQUIRED,
  ON_BEHALF_REQUIRED,
  SLOT_LABELS,
  isUsablePhone,
  slotHint,
  tidyPhone,
} from '@/lib/ticket-intake';
import {
  PRIORITIES,
  SUPPORT_TYPE_LIST,
  type Priority,
  type SupportType,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { AiChatApi } from '@/lib/use-ai-chat';
import { ticketStatusLabel } from './ticket-status';
import { Eyebrow } from '@/components/ui/primitives';
import { Notice } from '@/components/ui/patterns';
import { useLocale } from '@/lib/i18n';

/**
 * Ticket review and submit.
 *
 * The step between "the assistant has enough" and "a ticket exists". Two rules
 * drive the design:
 *
 *  - Every field is editable. The assistant is extracting from speech on a bad
 *    connection; a wrong number is worse than a slow conversation, and the
 *    reporter is the only one who actually knows the answer.
 *  - Nothing is sent without an explicit press. This is the same contract the
 *    action card keeps, and it is the reason the whole review is one screen
 *    rather than a wizard with a hidden final step.
 *
 * The form renders the six required attributes from the spec, always, in a
 * fixed order, so a responder reading a printed copy and a reporter filling
 * this in see the same shape.
 */

const MAX_PANEL_HEIGHT = 'min(34rem, calc(100dvh - 12rem))';

export function TicketReview({
  state,
  className,
}: {
  state: AiChatApi;
  className?: string;
}) {
  if (state.status === 'submitted' && state.ticket) {
    return <TicketReceipt state={state} className={className} />;
  }
  return <TicketForm state={state} className={className} />;
}

/* ------------------------------------------------------------------ *
 * Form
 * ------------------------------------------------------------------ */

function TicketForm({ state, className }: { state: AiChatApi; className?: string }) {
  const { draft, missing, rejected, busy, errorKey } = state;
  const { t, label } = useLocale();
  const rejectedSet = React.useMemo(() => new Set(rejected), [rejected]);

  // Attributes 1–6 from the spec, in order. `victimName`/`victimPhone` are
  // conditional on reporting for someone else, and move in when that is true.
  const attributes: { slot: SlotName; node: React.ReactNode }[] = [
    { slot: 'reporterName', node: <TextField slot="reporterName" state={state} /> },
    { slot: 'reporterPhone', node: <PhoneField slot="reporterPhone" state={state} /> },
    ...(draft.on_behalf_of_other
      ? [
          { slot: 'victimName' as SlotName, node: <TextField slot="victimName" state={state} /> },
          {
            slot: 'victimPhone' as SlotName,
            node: <PhoneField slot="victimPhone" state={state} />,
          },
        ]
      : []),
    { slot: 'summary', node: <SummaryField state={state} /> },
    { slot: 'location', node: <LocationField state={state} /> },
    { slot: 'supportNeeded', node: <SupportPicker state={state} /> },
    { slot: 'urgency', node: <UrgencyPicker state={state} /> },
  ];

  const complete = missing.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className={cn('flex flex-col', className)}
    >
      <CardHeader
        className="items-start px-4 py-3"
        icon={
          <span
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-dispatch-50 text-dispatch-700 ring-1 ring-inset ring-dispatch-200"
            aria-hidden="true"
          >
            <ClipboardCheck className="size-4.5" />
          </span>
        }
        actions={
          <Button
            variant="ghost"
            size="iconSm"
            onClick={state.reset}
            srLabel={t('review.backToChat')}
            className="-mr-1 -mt-0.5 shrink-0 text-navy-400 hover:text-navy-700"
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
        }
      >
        <CardTitle titleAs="h2">{t('review.title')}</CardTitle>
        <CardDescription className="text-2xs leading-relaxed">
          {t('review.subtitle')}
        </CardDescription>
      </CardHeader>

      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4"
        style={{ maxHeight: MAX_PANEL_HEIGHT }}
      >
        {errorKey && (
          <Notice tone="critical" icon={AlertCircle} role="alert">
            {t(errorKey)}
          </Notice>
        )}

        {attributes.map(({ slot, node }) => (
          <div
            key={slot}
            className={cn(
              'rounded-xl p-3 ring-1 ring-inset transition-colors',
              rejectedSet.has(slot)
                ? 'bg-emergency-50/60 ring-emergency-300'
                : 'bg-navy-50/50 ring-navy-200/60',
            )}
          >
            <FieldHeader slot={slot} state={state} />
            {node}
          </div>
        ))}

        {/* Attribute 4 — the creation timestamp. Shown, not editable: it is
            stamped by the service when the ticket is written, so showing the
            conversation time here would be a lie about the record. */}
        <div className="rounded-xl bg-navy-50/50 p-3 ring-1 ring-inset ring-navy-200/60">
          <Eyebrow>{t('review.ticketTime')}</Eyebrow>
          <p className="mt-1 text-xs leading-relaxed text-navy-600">{t('review.ticketTimeBody')}</p>
        </div>

        {/* Optional attribute, clearly marked as such. */}
        <div className="rounded-xl bg-navy-50/50 p-3 ring-1 ring-inset ring-navy-200/60">
          <FieldHeader slot="peopleAffected" state={state} optional />
          <input
            type="text"
            inputMode="numeric"
            value={draft.people_affected}
            onChange={(e) => state.edit({ people_affected: e.target.value })}
            placeholder={t('review.peoplePlaceholder')}
            aria-label={t('review.peopleAria')}
            className={inputClass}
          />
        </div>

        <OnBehalfToggle state={state} />

        {/* The voice transcript, disclosed before it is stored.
            Not a setting buried in a settings page: this is the last screen
            before the words become a row in a database that responders and the
            reporter can both read, so the choice is made here, with the
            transcript itself visible, rather than discovered afterwards. */}
        {state.viaVoice && state.voiceTranscript.length > 0 && (
          <VoiceTranscriptDisclosure state={state} />
        )}
      </div>

      <footer className="safe-bottom border-t border-navy-100 bg-navy-50/70 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Button
            variant="primary"
            size="md"
            onClick={() => void state.submit()}
            disabled={!complete || busy}
            loading={busy}
            className="flex-1"
          >
            <Send aria-hidden="true" />
            {t('review.submit')}
          </Button>
          <Button
            variant="ghost"
            size="md"
            onClick={state.reset}
            disabled={busy}
            className="shrink-0"
          >
            {t('review.back')}
          </Button>
        </div>

        <p className="mt-2 flex items-start gap-1.5 text-2xs leading-relaxed text-navy-500">
          {complete ? (
            <>
              <ShieldCheck className="mt-px size-3.5 shrink-0 text-relief-600" aria-hidden="true" />
              <span>{t('review.complete')}</span>
            </>
          ) : (
            <>
              <Info className="mt-px size-3.5 shrink-0 text-navy-400" aria-hidden="true" />
              <span>
                {t('review.stillNeeded', {
                  n: missing.length,
                  slots: missing
                    .map((slot) => label('slot', slot, SLOT_LABELS[slot]))
                    .join(', '),
                })}
              </span>
            </>
          )}
        </p>
      </footer>
    </motion.div>
  );
}

const inputClass = cn(
  'mt-1.5 w-full rounded-lg border border-navy-200 bg-white px-3 py-2.5 text-[15px] leading-relaxed text-navy-800',
  // 16px is the floor: anything smaller makes iOS zoom on focus.
  'placeholder:text-navy-300',
  'focus-visible:outline-none focus-visible:border-dispatch-500 focus-visible:ring-2 focus-visible:ring-dispatch-600/30',
);

/* ------------------------------------------------------------------ *
 * Voice transcript disclosure
 * ------------------------------------------------------------------ */

/**
 * What was said, and whether to keep it.
 *
 * Two decisions live here. First, the choice: the transcript is stored by
 * default, because a responder reading a phone number that was misheard has
 * nothing to work from otherwise, and the reporter can turn it off. Second, the
 * text: the turns are shown, not just counted, because "save this transcript"
 * is a different promise when you have read what is in it — and a misheard
 * number is the one thing a reporter might still catch here, in a way they cannot
 * catch it after submit.
 *
 * The opt-out is a real choice, not a dead control: unchecking sends no
 * transcript, and the backend then stores a `voice` ticket with no turns, which
 * renders as "you typed this in" everywhere it is read. That is a small lie and
 * it is deliberate — the alternative is a "no transcript" state threaded through
 * both readers for something that is indistinguishable from a typed ticket.
 */
function VoiceTranscriptDisclosure({ state }: { state: AiChatApi }) {
  const { t } = useLocale();
  const [open, setOpen] = React.useState(false);
  const turns = state.voiceTranscript;

  return (
    <div className="rounded-xl bg-dispatch-50/60 p-3 ring-1 ring-inset ring-dispatch-200">
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          id="save-voice-transcript"
          checked={state.saveVoiceTranscript}
          onChange={(e) => state.setSaveVoiceTranscript(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 rounded border-navy-300 accent-dispatch-600"
        />
        <div className="min-w-0 flex-1">
          <label
            htmlFor="save-voice-transcript"
            className="block text-xs font-bold text-navy-800"
          >
            {t('review.voice.saveLabel')}
          </label>
          <p className="mt-1 text-2xs leading-relaxed text-navy-600">
            {state.saveVoiceTranscript
              ? t('review.voice.saveBody', { n: turns.length })
              : t('review.voice.discardBody')}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2 flex min-h-11 w-full items-center justify-between rounded-lg px-2 text-2xs font-bold uppercase tracking-[0.08em] text-dispatch-700 hover:bg-dispatch-100/60"
      >
        {open ? t('review.voice.hide') : t('review.voice.show')}
        <ChevronDown
          aria-hidden="true"
          className={cn('size-4 transition-transform', open && 'rotate-180')}
        />
      </button>

      {/* `data-no-translate` on the list below, same reason as the filed
          transcript: this is what the reporter said, and it is what the ticket
          gets built from. */}
      {open && (
        <ol
          className="mt-1 max-h-64 space-y-2 overflow-y-auto overscroll-contain"
          data-no-translate
        >
          {turns.map((turn, i) => (
            <li
              // Re-renders on every transcription chunk, so the index is the
              // only stable identity here and the key must not be the text.
              key={i}
              className={cn(
                'rounded-lg px-2.5 py-2 text-xs leading-relaxed',
                turn.role === 'reporter'
                  ? 'bg-white text-navy-800 ring-1 ring-inset ring-navy-200'
                  : 'bg-dispatch-100/70 text-navy-700',
              )}
            >
              <span className="sr-only">
                {t(turn.role === 'reporter' ? 'review.voice.youSaid' : 'review.voice.assistantSaid')}
              </span>
              <span aria-hidden="true" className="font-bold">
                {t(turn.role === 'reporter' ? 'review.voice.you' : 'review.voice.assistant')}
              </span>{' '}
              {turn.text}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Label plus its required/optional marker and a hint on hover. */
function FieldHeader({
  slot,
  state,
  optional = false,
}: {
  slot: SlotName;
  state: AiChatApi;
  optional?: boolean;
}) {
  const { t, label } = useLocale();
  const required = state.draft.on_behalf_of_other
    ? [...ALWAYS_REQUIRED, ...ON_BEHALF_REQUIRED]
    : ALWAYS_REQUIRED;
  const isRequired = required.includes(slot);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Eyebrow className="text-navy-500">{label('slot', slot, SLOT_LABELS[slot])}</Eyebrow>
      <span
        className={cn(
          'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
          isRequired ? 'bg-navy-900 text-white' : 'bg-navy-200 text-navy-600',
        )}
      >
        {t(isRequired ? 'review.required' : 'review.optional')}
      </span>
    </div>
  );
}

function TextField({ slot, state }: { slot: SlotName; state: AiChatApi }) {
  const { t, label } = useLocale();
  const value =
    slot === 'reporterName'
      ? state.draft.reporter_name
      : slot === 'victimName'
        ? state.draft.victim_name
        : state.draft.people_affected;

  return (
    <input
      type="text"
      autoComplete={slot === 'reporterName' ? 'name' : 'off'}
      value={value}
      onChange={(e) =>
        state.edit(
          slot === 'reporterName'
            ? { reporter_name: e.target.value }
            : slot === 'victimName'
              ? { victim_name: e.target.value }
              : { people_affected: e.target.value },
        )
      }
      placeholder={t(slot === 'reporterName' ? 'review.namePlaceholder' : 'review.victimNamePlaceholder')}
      aria-label={label('slot', slot, SLOT_LABELS[slot])}
      className={inputClass}
    />
  );
}

function PhoneField({ slot, state }: { slot: SlotName; state: AiChatApi }) {
  const { t, label } = useLocale();
  const value =
    slot === 'reporterPhone' ? state.draft.reporter_phone : state.draft.victim_phone;
  const invalid = value.trim().length > 0 && !isUsablePhone(value);

  return (
    <>
      <div className="relative mt-1.5">
        <Phone
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-navy-300"
          aria-hidden="true"
        />
        <input
          type="tel"
          inputMode="tel"
          autoComplete={slot === 'reporterPhone' ? 'tel' : 'off'}
          value={value}
          onChange={(e) =>
            state.edit(
              slot === 'reporterPhone'
                ? { reporter_phone: e.target.value }
                : { victim_phone: e.target.value },
            )
          }
          onBlur={(e) => {
            // Numbers are dictated out loud, so they arrive with spaces and
            // dashes. Tidy on blur rather than mid-keystroke, which would fight
            // the caret.
            const tidy = tidyPhone(e.target.value);
            if (tidy !== e.target.value) {
              state.edit(
                slot === 'reporterPhone'
                  ? { reporter_phone: tidy }
                  : { victim_phone: tidy },
              );
            }
          }}
          placeholder={t('review.phonePlaceholder')}
          aria-label={label('slot', slot, SLOT_LABELS[slot])}
          aria-invalid={invalid || undefined}
          className={cn(inputClass, 'pl-9', invalid && 'border-emergency-400 ring-emergency-300')}
        />
      </div>
      {invalid && (
        <p className="mt-1.5 flex items-center gap-1 text-2xs font-semibold text-emergency-700">
          <AlertCircle className="size-3" aria-hidden="true" />
          {t('review.phoneInvalid')}
        </p>
      )}
    </>
  );
}

function SummaryField({ state }: { state: AiChatApi }) {
  const { t, label } = useLocale();
  return (
    <textarea
      rows={3}
      value={state.draft.summary}
      onChange={(e) => state.edit({ summary: e.target.value })}
      placeholder={t('review.summaryPlaceholder')}
      aria-label={label('slot', 'summary', SLOT_LABELS.summary)}
      className={cn(inputClass, 'resize-none')}
    />
  );
}

function LocationField({ state }: { state: AiChatApi }) {
  const { t, label } = useLocale();
  return (
    <div className="relative mt-1.5">
      <MapPin
        className="pointer-events-none absolute left-3 top-3 size-4 text-navy-300"
        aria-hidden="true"
      />
      <input
        type="text"
        value={state.draft.location}
        onChange={(e) => state.edit({ location: e.target.value })}
        placeholder={t('review.locationPlaceholder')}
        aria-label={label('slot', 'location', SLOT_LABELS.location)}
        className={cn(inputClass, 'pl-9')}
      />
    </div>
  );
}

function SupportPicker({ state }: { state: AiChatApi }) {
  const { t, label } = useLocale();
  const selected = state.draft.support_needed;

  return (
    <fieldset className="mt-2">
      <legend className="sr-only">{label('slot', 'supportNeeded', SLOT_LABELS.supportNeeded)}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SUPPORT_TYPE_LIST.map((support) => {
          const active = selected.includes(support.id);
          const Icon = support.icon;
          return (
            <button
              key={support.id}
              type="button"
              onClick={() => state.toggleSupport(support.id as SupportType)}
              aria-pressed={active}
              className={cn(
                'group flex min-h-[52px] items-start gap-2.5 rounded-lg border p-2.5 text-left no-tap-highlight',
                'transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600 focus-visible:ring-offset-1',
                active
                  ? 'border-dispatch-400 bg-dispatch-50 ring-1 ring-dispatch-200'
                  : 'border-navy-200 bg-white hover:border-navy-300 hover:bg-navy-50',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 grid size-6 shrink-0 place-items-center rounded-md',
                  active ? 'bg-dispatch-600 text-white' : 'bg-navy-100 text-navy-500',
                )}
                aria-hidden="true"
              >
                {active ? <Check className="size-3.5" strokeWidth={3} /> : <Icon className="size-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold leading-snug text-navy-900">
                  {label('support', support.id, support.label)}
                </span>
                <span className="mt-0.5 block text-2xs leading-relaxed text-navy-500">
                  {support.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {selected.length === 0 && (
        <p className="mt-2 flex items-center gap-1 text-2xs font-semibold text-alert-700">
          <AlertCircle className="size-3" aria-hidden="true" />
          {t('review.pickSupport')}
        </p>
      )}
    </fieldset>
  );
}

function UrgencyPicker({ state }: { state: AiChatApi }) {
  const { t, label } = useLocale();
  return (
    <fieldset className="mt-2">
      <legend className="sr-only">{label('slot', 'urgency', SLOT_LABELS.urgency)}</legend>
      <div className="grid grid-cols-2 gap-2">
        {(['critical', 'high', 'medium', 'low'] as const).map((level) => {
          const meta = PRIORITIES[level as Priority];
          const active = state.draft.urgency === level;
          return (
            <button
              key={level}
              type="button"
              onClick={() => state.edit({ urgency: level as Priority })}
              aria-pressed={active}
              className={cn(
                'flex min-h-[44px] items-center gap-2 rounded-lg border px-2.5 py-2 text-left no-tap-highlight',
                'transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600 focus-visible:ring-offset-1',
                active
                  ? 'border-navy-400 bg-navy-50 ring-1 ring-navy-300'
                  : 'border-navy-200 bg-white hover:border-navy-300 hover:bg-navy-50',
              )}
            >
              <span
                className={cn('size-2.5 shrink-0 rounded-full', meta.dot)}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-navy-900">
                  {label('priority', level, meta.label)}
                </span>
                <span className="nums block text-2xs text-navy-500">
                  {t(
                    meta.slaMinutes >= 60 ? 'review.targetHours' : 'review.targetMinutes',
                    { n: meta.slaMinutes >= 60 ? Math.round(meta.slaMinutes / 60) : meta.slaMinutes },
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function OnBehalfToggle({ state }: { state: AiChatApi }) {
  const { t } = useLocale();
  const on = state.draft.on_behalf_of_other;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => state.setOnBehalf(!on)}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border p-3 text-left no-tap-highlight',
        'transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dispatch-600 focus-visible:ring-offset-1',
        on ? 'border-navy-300 bg-navy-50' : 'border-navy-200 bg-white hover:bg-navy-50',
      )}
    >
      <span
        className={cn(
          'mt-0.5 grid size-6 shrink-0 place-items-center rounded-md',
          on ? 'bg-navy-900 text-white' : 'bg-navy-100 text-navy-500',
        )}
        aria-hidden="true"
      >
        <User className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-navy-900">
          {t(on ? 'review.onBehalf.for' : 'review.onBehalf.self')}
        </span>
        <span className="mt-0.5 block text-2xs leading-relaxed text-navy-500">
          {t(on ? 'review.onBehalf.forBody' : 'review.onBehalf.selfBody')}
        </span>
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Receipt
 * ------------------------------------------------------------------ */

function TicketReceipt({ state, className }: { state: AiChatApi; className?: string }) {
  const ticket = state.ticket;
  const { t, locale, label } = useLocale();
  if (!ticket) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={cn('flex flex-col', className)}
    >
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5"
        style={{ maxHeight: MAX_PANEL_HEIGHT }}
      >
        <div className="flex flex-col items-center text-center">
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="grid size-14 place-items-center rounded-2xl bg-relief-100 text-relief-700 ring-1 ring-inset ring-relief-200"
            aria-hidden="true"
          >
            <CheckCircle2 className="size-7" />
          </motion.span>

          <p className="nums mt-3 font-mono text-sm font-bold tracking-tight text-relief-700">
            {ticket.id}
          </p>
          <h2 className="mt-1 text-base font-bold tracking-tight text-navy-900">
            {t('receipt.title')}
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-navy-500">{t('receipt.body')}</p>
        </div>

        {/* `data-no-translate`: the receipt's facts — reference, submitted-at,
            location, and the support types the reporter is about to be called
            about. The sentences around it are curated and translated; the values
            in this list are a record to be read back exactly. */}
        <dl
          className="mt-5 space-y-2.5 rounded-xl bg-navy-50/70 p-3.5 ring-1 ring-inset ring-navy-200"
          data-no-translate
        >
          <ReceiptRow label={t('receipt.row.reference')} value={ticket.id} mono />
          <ReceiptRow
            label={t('receipt.row.submitted')}
            // `numberingSystem: 'latn'` is not decoration: a Nepali-locale date
            // otherwise renders in Devanagari digits, and the reference above it
            // and the phone number a responder calls back are both Latin. Mixed
            // digit systems in one receipt is how a reference gets misread.
            value={new Date(ticket.created_at).toLocaleString(
              locale === 'ne' ? 'ne-NP' : 'en-US',
              { dateStyle: 'medium', timeStyle: 'short', numberingSystem: 'latn' },
            )}
          />
          <ReceiptRow
            label={t('receipt.row.status')}
            value={label('ticketStatus', ticket.status, ticketStatusLabel(ticket.status))}
          />
          <ReceiptRow
            label={t('receipt.row.support')}
            value={ticket.support_needed
              .map((type) => {
                const meta = SUPPORT_TYPE_LIST.find((s) => s.id === type);
                return meta ? label('support', meta.id, meta.shortLabel) : type;
              })
              .join(', ')}
          />
          <ReceiptRow
            label={t('receipt.row.priority')}
            value={label('priority', ticket.urgency, ticket.urgency)}
          />
          <ReceiptRow label={t('receipt.row.location')} value={ticket.location} />
        </dl>

        <p className="mt-3 flex items-start gap-1.5 text-2xs leading-relaxed text-navy-500">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {ticket.owner_email ? (
            <span>
              {t('receipt.ownedBefore')}{' '}
              <Link
                href="/tickets"
                className="font-semibold text-navy-700 underline underline-offset-2"
              >
                {t('receipt.ownedLink')}
              </Link>{' '}
              {t('receipt.ownedAfter')}
            </span>
          ) : (
            // Signed out at intake, so there is nothing to look the ticket up
            // by later. Saying so plainly is the point: a dead link here would
            // send someone looking for a page that can never find their ticket.
            <span>{t('receipt.orphanNote')}</span>
          )}
        </p>
      </div>

      <footer className="safe-bottom border-t border-navy-100 bg-navy-50/70 px-4 py-3">
        <div className="flex items-center gap-2.5">
          {/* `startNewCase`, not `reset`: this is a different emergency, so the
              model's context is cut. The visible transcript stays — the reporter
              should not lose what they already told us — but without this the
              second ticket inherits the first one's name, phone and urgency. */}
          <Button
            variant="primary"
            size="md"
            onClick={state.startNewCase}
            className="flex-1"
          >
            <Pencil aria-hidden="true" />
            {t('receipt.another')}
          </Button>
          <Button variant="ghost" size="md" onClick={state.dismissTicket}>
            {t('receipt.done')}
          </Button>
        </div>
      </footer>
    </motion.div>
  );
}

function ReceiptRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <Eyebrow as="dt" className="w-24 shrink-0 text-navy-400">
        {label}
      </Eyebrow>
      <dd
        className={cn(
          'min-w-0 flex-1 break-words text-xs font-semibold text-navy-800',
          mono && 'font-mono',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Inline checklist
 *
 * Rendered under the composer so a person can see exactly what the assistant
 * still needs without opening the review form.
 * ------------------------------------------------------------------ */

export function IntakeChecklist({ state }: { state: AiChatApi }) {
  const { label } = useLocale();
  if (state.missing.length === 0) return null;
  return (
    <AnimatePresence initial={false}>
      <motion.ul
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="space-y-1 overflow-hidden"
      >
        {state.missing.map((slot) => (
          <li key={slot} className="flex items-center gap-2 text-2xs text-navy-500">
            <X className="size-3 shrink-0 text-navy-300" aria-hidden="true" />
            <span className="font-semibold text-navy-700">
              {label('slot', slot, SLOT_LABELS[slot])}
            </span>
            <span className="min-w-0 truncate text-navy-400">
              {label('slotHint', slot, slotHint(slot))}
            </span>
          </li>
        ))}
      </motion.ul>
    </AnimatePresence>
  );
}
