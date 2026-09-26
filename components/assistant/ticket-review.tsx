'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Info,
  Loader2,
  MapPin,
  Pencil,
  Phone,
  Send,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import type { SlotName, TicketDraft } from '@/lib/ai-client';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AiChatApi } from '@/lib/use-ai-chat';

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
  const { draft, missing, rejected, busy, error } = state;
  const rejectedSet = React.useMemo(() => new Set(rejected), [rejected]);
  const missingSet = React.useMemo(() => new Set(missing), [missing]);

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
      <header className="flex items-start gap-3 border-b border-navy-100 px-4 py-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-dispatch-50 text-dispatch-700 ring-1 ring-inset ring-dispatch-200"
          aria-hidden="true"
        >
          <ClipboardCheck className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold tracking-tight text-navy-900">
            Review your relief ticket
          </h2>
          <p className="mt-0.5 text-2xs leading-relaxed text-navy-500">
            Everything here can be changed. Nothing is sent until you press submit.
          </p>
        </div>
        <Button
          variant="ghost"
          size="iconSm"
          onClick={state.reset}
          srLabel="Back to the conversation"
          className="-mr-1 -mt-0.5 shrink-0 text-navy-400 hover:text-navy-700"
        >
          <ArrowLeft aria-hidden="true" />
        </Button>
      </header>

      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4"
        style={{ maxHeight: MAX_PANEL_HEIGHT }}
      >
        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-emergency-200 bg-emergency-50 px-3 py-2.5 text-xs font-semibold leading-relaxed text-emergency-800"
          >
            <AlertCircle className="mt-px size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
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
          <p className="text-2xs font-bold uppercase tracking-[0.08em] text-navy-400">
            Ticket time
          </p>
          <p className="mt-1 text-xs leading-relaxed text-navy-600">
            Stamped automatically the moment you submit, so responders always know
            when the call was made.
          </p>
        </div>

        {/* Optional attribute, clearly marked as such. */}
        <div className="rounded-xl bg-navy-50/50 p-3 ring-1 ring-inset ring-navy-200/60">
          <FieldHeader slot="peopleAffected" state={state} optional />
          <input
            type="text"
            inputMode="numeric"
            value={draft.people_affected}
            onChange={(e) => state.edit({ people_affected: e.target.value })}
            placeholder="e.g. 4"
            aria-label="How many people need help"
            className={inputClass}
          />
        </div>

        <OnBehalfToggle state={state} />
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
            Submit ticket
          </Button>
          <Button
            variant="ghost"
            size="md"
            onClick={state.reset}
            disabled={busy}
            className="shrink-0"
          >
            Back
          </Button>
        </div>

        <p className="mt-2 flex items-start gap-1.5 text-2xs leading-relaxed text-navy-500">
          {complete ? (
            <>
              <ShieldCheck className="mt-px size-3.5 shrink-0 text-relief-600" aria-hidden="true" />
              <span>
                All required details are present. A response team reviews every ticket
                before anyone is dispatched, and you will be told what happens next.
              </span>
            </>
          ) : (
            <>
              <Info className="mt-px size-3.5 shrink-0 text-navy-400" aria-hidden="true" />
              <span>
                <span className="nums font-bold">{missing.length}</span>{' '}
                {missing.length === 1 ? 'detail is' : 'details are'} still needed:{' '}
                {missing.map((slot) => SLOT_LABELS[slot].toLowerCase()).join(', ')}.
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
  const required = state.draft.on_behalf_of_other
    ? [...ALWAYS_REQUIRED, ...ON_BEHALF_REQUIRED]
    : ALWAYS_REQUIRED;
  const isRequired = required.includes(slot);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <p className="text-2xs font-bold uppercase tracking-[0.08em] text-navy-500">
        {SLOT_LABELS[slot]}
      </p>
      <span
        className={cn(
          'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
          isRequired ? 'bg-navy-900 text-white' : 'bg-navy-200 text-navy-600',
        )}
      >
        {isRequired ? 'Required' : 'Optional'}
      </span>
    </div>
  );
}

function TextField({ slot, state }: { slot: SlotName; state: AiChatApi }) {
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
      placeholder={slot === 'reporterName' ? 'e.g. Diego Alvarez' : 'e.g. Maria Alvarez'}
      aria-label={SLOT_LABELS[slot]}
      className={inputClass}
    />
  );
}

function PhoneField({ slot, state }: { slot: SlotName; state: AiChatApi }) {
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
          placeholder="e.g. 555-0143"
          aria-label={SLOT_LABELS[slot]}
          aria-invalid={invalid || undefined}
          className={cn(inputClass, 'pl-9', invalid && 'border-emergency-400 ring-emergency-300')}
        />
      </div>
      {invalid && (
        <p className="mt-1.5 flex items-center gap-1 text-2xs font-semibold text-emergency-700">
          <AlertCircle className="size-3" aria-hidden="true" />
          That does not look like a number a responder can dial.
        </p>
      )}
    </>
  );
}

function SummaryField({ state }: { state: AiChatApi }) {
  return (
    <textarea
      rows={3}
      value={state.draft.summary}
      onChange={(e) => state.edit({ summary: e.target.value })}
      placeholder="In your own words: what is happening and what do they need?"
      aria-label={SLOT_LABELS.summary}
      className={cn(inputClass, 'resize-none')}
    />
  );
}

function LocationField({ state }: { state: AiChatApi }) {
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
        placeholder="e.g. 12 Beacon St, Eastvale — flat 4B, green door"
        aria-label={SLOT_LABELS.location}
        className={cn(inputClass, 'pl-9')}
      />
    </div>
  );
}

function SupportPicker({ state }: { state: AiChatApi }) {
  const selected = state.draft.support_needed;

  return (
    <fieldset className="mt-2">
      <legend className="sr-only">{SLOT_LABELS.supportNeeded}</legend>
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
                  {support.label}
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
          Pick at least one so the right team is contacted.
        </p>
      )}
    </fieldset>
  );
}

function UrgencyPicker({ state }: { state: AiChatApi }) {
  return (
    <fieldset className="mt-2">
      <legend className="sr-only">{SLOT_LABELS.urgency}</legend>
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
                <span className="block text-xs font-bold text-navy-900">{meta.label}</span>
                <span className="nums block text-2xs text-navy-500">
                  {meta.slaMinutes >= 60
                    ? `${Math.round(meta.slaMinutes / 60)}h target`
                    : `${meta.slaMinutes} min target`}
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
          {on ? 'Reporting for someone else' : 'I am the person who needs help'}
        </span>
        <span className="mt-0.5 block text-2xs leading-relaxed text-navy-500">
          {on
            ? "Their name and number are required, so a responder can reach them directly."
            : 'Your own name and number cover both you and the ticket.'}
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
            Your ticket has been submitted
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-navy-500">
            A response team reviews every ticket before anyone is dispatched. You will be told
            what happens next on the number you gave us.
          </p>
        </div>

        <dl className="mt-5 space-y-2.5 rounded-xl bg-navy-50/70 p-3.5 ring-1 ring-inset ring-navy-200">
          <ReceiptRow label="Reference" value={ticket.id} mono />
          <ReceiptRow
            label="Submitted"
            value={new Date(ticket.created_at).toLocaleString('en-US', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          />
          <ReceiptRow label="Status" value="Waiting for review" />
          <ReceiptRow
            label="Support"
            value={ticket.support_needed
              .map((t) => SUPPORT_TYPE_LIST.find((s) => s.id === t)?.shortLabel ?? t)
              .join(', ')}
          />
          <ReceiptRow label="Priority" value={ticket.urgency} />
          <ReceiptRow label="Location" value={ticket.location} />
        </dl>

        <p className="mt-3 flex items-start gap-1.5 text-2xs leading-relaxed text-navy-500">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Keep this reference. An admin reviewing the queue will use it to look the ticket up.
          </span>
        </p>
      </div>

      <footer className="safe-bottom border-t border-navy-100 bg-navy-50/70 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Button variant="primary" size="md" onClick={state.reset} className="flex-1">
            <Pencil aria-hidden="true" />
            Report something else
          </Button>
          <Button variant="ghost" size="md" onClick={state.dismissTicket}>
            Done
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
      <dt className="w-24 shrink-0 text-2xs font-bold uppercase tracking-[0.06em] text-navy-400">
        {label}
      </dt>
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
            <span className="font-semibold text-navy-700">{SLOT_LABELS[slot]}</span>
            <span className="min-w-0 truncate text-navy-400">{slotHint(slot)}</span>
          </li>
        ))}
      </motion.ul>
    </AnimatePresence>
  );
}

export { Loader2 };
