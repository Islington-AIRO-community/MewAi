'use client';

import * as React from 'react';
import {
  createTicket,
  emptyDraft,
  sendChatTurn,
  type ChatTurnResult,
  type SlotName,
  type StoredTicket,
  type TicketDraft,
} from '@/lib/ai-client';
import { missingSlots } from '@/lib/ticket-intake';
import type { ChatMessage, SupportType } from '@/lib/types';
import { useApp } from '@/lib/store';

/**
 * The live AI chat intake.
 *
 * Owns the conversation loop that `lib/store.tsx` used to fake. The store still
 * holds the transcript so every existing surface (the floating assistant, the
 * action card, the dashboard) keeps working unchanged; this hook adds the
 * ticket lifecycle on top of it.
 *
 * Degradation is the important design decision here. `sendMessage` in the store
 * still runs its scripted replies, and this hook layers the real backend on top
 * when it answers. That means:
 *
 *   - the demo is never dead, even with the backend stopped
 *   - `npm run dev` works before anyone starts Postgres
 *   - a Gemini outage degrades to a scripted reply instead of a spinner
 *
 * The cost is that the transcript can contain both kinds of reply. That is
 * visible to the user as a small "offline reply" marker rather than hidden,
 * because a silent fake answer during an emergency is the one failure mode
 * worth spending UI space on.
 */

export type AssistantStatus = 'idle' | 'thinking' | 'review' | 'submitted' | 'offline';

export interface AiChatState {
  status: AssistantStatus;
  draft: TicketDraft;
  /** Slots the backend still needs. Empty when the draft is submittable. */
  missing: SlotName[];
  /** Slots the assistant asked about on the most recent turn. */
  asking: SlotName[];
  /** True while a request is in flight, for the composer's busy state. */
  busy: boolean;
  /** True when the last turn came from the scripted fallback, not the model. */
  offline: boolean;
  /** Set once a ticket has been written, so the review form can show a receipt. */
  ticket: StoredTicket | null;
  /** Field names the backend rejected on submit, to highlight in the form. */
  rejected: SlotName[];
  error: string;
  safetyNote: string;
}

export interface AiChatApi extends AiChatState {
  /** Send a user turn and fold the assistant's answer into the transcript. */
  send: (text: string, opts?: { viaVoice?: boolean }) => Promise<void>;
  /** Patch the working draft from the review form. */
  edit: (patch: Partial<TicketDraft>) => void;
  /** Toggle a support type on the draft. */
  toggleSupport: (type: SupportType) => void;
  /** Turn the "reporting for someone else" switch. */
  setOnBehalf: (value: boolean) => void;
  /**
   * Open the review form without waiting for the assistant.
   *
   * The escape hatch. Filing a ticket must never depend on the model being
   * reachable — a degraded turn can never report the intake complete, so
   * without this the composer is the only thing an outage leaves behind.
   */
  openReview: () => void;
  /** Start a fresh ticket, keeping the transcript. */
  reset: () => void;
  /** Write the ticket. Resolves with the stored ticket, or null if rejected. */
  submit: () => Promise<StoredTicket | null>;
  /** Back to the conversation after reviewing a submitted ticket. */
  dismissTicket: () => void;
}

const INITIAL: AiChatState = {
  status: 'idle',
  draft: emptyDraft(),
  missing: missingSlots(emptyDraft()),
  asking: [],
  busy: false,
  offline: false,
  ticket: null,
  rejected: [],
  error: '',
  safetyNote: '',
};

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** `SlotName` -> the `TicketDraft` key holding that value. */
const SLOT_TO_FIELD: Record<SlotName, keyof TicketDraft> = {
  reporterName: 'reporter_name',
  reporterPhone: 'reporter_phone',
  victimName: 'victim_name',
  victimPhone: 'victim_phone',
  summary: 'summary',
  location: 'location',
  supportNeeded: 'support_needed',
  urgency: 'urgency',
  peopleAffected: 'people_affected',
};

export function useAiChat(): AiChatApi {
  const {
    messages,
    sendMessage,
    appendAssistantMessage,
    scriptedReplyFor,
    createReportFromTicket,
  } = useApp();
  const [state, setState] = React.useState<AiChatState>(INITIAL);

  // Stable per mount: groups this ticket with the conversation it came from,
  // and is what the admin view will key on later.
  const sessionId = React.useRef(
    typeof window === 'undefined' ? 'ssr' : `sess-${makeId('x').slice(2)}`,
  );

  // The transcript is replayed to the backend on every turn, but only the real
  // conversation — the seeded demo messages in mock-data would otherwise be sent
  // as if the user had said them.
  const transcript = React.useRef<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const synced = React.useRef(false);
  if (!synced.current) {
    synced.current = true;
    transcript.current = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', text: m.text }));
  }

  // Hand-edited values, re-sent on every turn so a correction in the review
  // form is never reverted by the model's next answer.
  const edits = React.useRef<Record<string, string>>({});

  const send = React.useCallback(
    async (text: string, opts?: { viaVoice?: boolean }) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      transcript.current = [...transcript.current, { role: 'user', text: trimmed }];
      setState((prev) => ({ ...prev, busy: true, status: 'thinking', error: '' }));

      // `deferReply` puts the user's message into the shared transcript and
      // leaves the assistant turn to us. Letting the store answer first would
      // show a canned reply, then the real one a few seconds later, so the
      // canned reply would read as the answer.
      await sendMessage(trimmed, { ...opts, deferReply: true });

      try {
        const turn: ChatTurnResult = await sendChatTurn({
          messages: transcript.current,
          sessionId: sessionId.current,
          editedDraft: Object.keys(edits.current).length
            ? { ...edits.current }
            : undefined,
        });

        const draft = mergeDraft(state.draft, turn.draft);
        const missing = turn.missing ?? missingSlots(draft);
        transcript.current = [
          ...transcript.current,
          { role: 'assistant', text: turn.reply },
        ];

        appendAssistantMessage({
          text: turn.reply,
          confidence: turn.confidence,
          offline: turn.degraded,
        });

        // Drop edits for values the user has since changed, so a stale
        // correction cannot pin a field to something they just fixed.
        for (const key of Object.keys(edits.current)) {
          const field = SLOT_TO_FIELD[key as SlotName];
          if (field && draft[field] !== edits.current[key]) delete edits.current[key];
        }

        setState((prev) => ({
          ...prev,
          busy: false,
          // Opened off the client-computed `missing`, not the server's
          // `is_complete`. The two are derived from the same rule
          // (`missingSlots` mirrors `missing_slots`), but the server can only
          // say yes after a successful Gemini turn — and the degraded turn
          // never carries a name, number or location, so during an outage
          // `is_complete` was permanently false. That made the one durable way
          // to file a ticket conditional on the AI being up, which is exactly
          // backwards for a disaster. `submit()` re-checks locally and the
          // backend checks again, so an over-eager open still cannot write an
          // incomplete ticket.
          status: missing.length === 0 ? 'review' : 'thinking',
          draft,
          missing,
          asking: turn.next_questions ?? [],
          offline: turn.degraded,
          safetyNote: turn.safety_note ?? '',
          // A complete draft invalidates a previous rejection.
          rejected: missing.length === 0 ? [] : prev.rejected,
        }));
      } catch {
        // Backend down, key wrong, or a network blip. Fall back to the scripted
        // reply so the transcript is not left hanging on a typing indicator, and
        // mark it `offline` so the UI says where the answer came from.
        const fallback = scriptedReplyFor(trimmed);
        transcript.current = [
          ...transcript.current,
          { role: 'assistant', text: fallback.text },
        ];
        appendAssistantMessage({ ...fallback, offline: true });
        setState((prev) => ({ ...prev, busy: false, offline: true }));
      }
    },
    [sendMessage, appendAssistantMessage, scriptedReplyFor, state.draft],
  );

  const edit = React.useCallback((patch: Partial<TicketDraft>) => {
    setState((prev) => {
      const draft = { ...prev.draft, ...patch };
      // Record the edit so the next assistant turn cannot revert it.
      for (const [key, value] of Object.entries(patch)) {
        if (typeof value === 'string' && value.trim()) edits.current[key] = value;
      }
      return {
        ...prev,
        draft,
        missing: missingSlots(draft),
        status: prev.ticket ? prev.status : 'review',
        rejected: prev.rejected.filter((slot) => {
          const field = SLOT_TO_FIELD[slot];
          return field ? String(draft[field] ?? '') === '' : false;
        }),
      };
    });
  }, []);

  const toggleSupport = React.useCallback((type: SupportType) => {
    setState((prev) => {
      const has = prev.draft.support_needed.includes(type);
      const support_needed = has
        ? prev.draft.support_needed.filter((t) => t !== type)
        : [...prev.draft.support_needed, type];
      const draft = { ...prev.draft, support_needed };
      for (const key of Object.keys(edits.current)) {
        if (key === 'support_needed') delete edits.current[key];
      }
      return {
        ...prev,
        draft,
        missing: missingSlots(draft),
        status: prev.ticket ? prev.status : 'review',
      };
    });
  }, []);

  const setOnBehalf = React.useCallback((value: boolean) => {
    setState((prev) => {
      const draft = { ...prev.draft, on_behalf_of_other: value };
      if (!value) {
        // Stop claiming to be a third party: the reporter's own details become
        // the victim's, so a self-report does not look like a missing-field case.
        draft.victim_name = draft.victim_name || draft.reporter_name;
        draft.victim_phone = draft.victim_phone || draft.reporter_phone;
      }
      return { ...prev, draft, missing: missingSlots(draft) };
    });
  }, []);

  const reset = React.useCallback(() => {
    edits.current = {};
    setState({ ...INITIAL, draft: emptyDraft(), missing: missingSlots(emptyDraft()) });
  }, []);

  const submit = React.useCallback(async (): Promise<StoredTicket | null> => {
    setState((prev) => ({ ...prev, busy: true, error: '' }));
    const { draft } = state;

    // Pre-flight with the same predicate the backend uses, so an obviously
    // incomplete form fails instantly instead of after a round trip.
    const missing = missingSlots(draft);
    if (missing.length > 0) {
      setState((prev) => ({
        ...prev,
        busy: false,
        status: 'review',
        missing,
        rejected: missing,
        error: 'Some required details are still missing.',
      }));
      return null;
    }

    try {
      const ticket = await createTicket({
        reporter_name: draft.reporter_name,
        reporter_phone: draft.reporter_phone,
        victim_name: draft.victim_name,
        victim_phone: draft.victim_phone,
        summary: draft.summary,
        location: draft.location,
        people_affected: draft.people_affected || null,
        support_needed: draft.support_needed,
        // `missing` being empty guarantees urgency is set.
        urgency: draft.urgency ?? 'medium',
        on_behalf_of_other: draft.on_behalf_of_other,
        notes: draft.notes,
        session_id: sessionId.current,
      });

      // The ticket is written server-side. Mirror it into the report list so it
      // is trackable from the dashboard like any other report, and so the
      // transcript records the hand-off the receipt promises.
      createReportFromTicket(ticket);

      setState((prev) => ({
        ...prev,
        busy: false,
        status: 'submitted',
        ticket,
        rejected: [],
        error: '',
      }));
      return ticket;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        busy: false,
        status: 'review',
        error: ticketErrorMessage(error),
        rejected: rejectedSlots(error),
      }));
      return null;
    }
  }, [state, createReportFromTicket]);

  const dismissTicket = React.useCallback(() => {
    setState((prev) => ({ ...prev, status: 'idle', ticket: null }));
  }, []);

  /**
   * Open the review form on request, without waiting for the assistant to
   * decide the intake is finished.
   *
   * This is the escape hatch that keeps an outage from being a dead end. The
   * reporter can always get to a form they can type into, which is a very
   * different outcome from a composer that keeps asking the same question at
   * someone who is typing one-handed in a basement.
   *
   * Arriving with an incomplete draft is fine. `submit()` pre-flights with the
   * same `missingSlots` predicate and lights up whatever is still blank, so the
   * form opens, the fields are editable, and nothing writes until it is whole.
   */
  const openReview = React.useCallback(() => {
    setState((prev) => ({ ...prev, status: 'review', error: '' }));
  }, []);

  return {
    ...state,
    send,
    edit,
    toggleSupport,
    setOnBehalf,
    openReview,
    reset,
    submit,
    dismissTicket,
  };
}

/**
 * Merge a model draft over the working draft.
 *
 * The backend is stateless per turn and returns the whole ticket, but an empty
 * string there means "not captured", which is indistinguishable from "the user
 * deliberately cleared this field". So a non-empty model value overwrites, and
 * a hand-edited value always wins. Without this a cleared field would silently
 * refill from the model's stale memory of the conversation.
 */
function mergeDraft(current: TicketDraft, incoming: TicketDraft): TicketDraft {
  const merged = { ...current } as TicketDraft;
  // Only the free-text slots are merged this way. `support_needed`, `urgency`
  // and `on_behalf_of_other` are classifications the model asserts rather than
  // values it transcribes, so an empty answer is a real answer ("I don't know
  // how urgent") and is handled separately below.
  const fields = [
    'reporter_name',
    'reporter_phone',
    'victim_name',
    'victim_phone',
    'summary',
    'location',
    'people_affected',
    'notes',
  ] as const;
  for (const field of fields) {
    const value = incoming[field];
    if (value.trim()) merged[field] = value;
  }
  if (incoming.support_needed.length > 0) {
    merged.support_needed = incoming.support_needed;
  }
  if (incoming.urgency) merged.urgency = incoming.urgency;
  // `on_behalf_of_other` is a statement about the relationship, not a captured
  // value, so the latest answer always wins.
  merged.on_behalf_of_other = incoming.on_behalf_of_other;
  return merged;
}

/** Pull the backend's 422 field list out of a failed request. */
function rejectedSlots(error: unknown): SlotName[] {
  if (!(error instanceof Error)) return [];
  const match = error.message.match(/"missing":\s*\[([^\]]*)\]/);
  if (!match) return [];
  const names = match[1]
    .split(',')
    .map((s) => s.trim().replace(/"/g, ''))
    .filter(Boolean);
  return names.filter((name): name is SlotName =>
    [
      'reporterName',
      'reporterPhone',
      'victimName',
      'victimPhone',
      'summary',
      'location',
      'supportNeeded',
      'urgency',
      'peopleAffected',
    ].includes(name),
  );
}

function ticketErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'The ticket could not be created.';
  if (/backend_unreachable/.test(error.message)) {
    return 'The relief service could not be reached. Your details are still here — try again in a moment.';
  }
  // The backend is up and answering, but its database is not. Distinct from
  // both the validation and the unreachable cases: retrying in a moment is
  // right, and the reporter should know nothing is wrong with what they typed.
  if (/\b503\b/.test(error.message)) {
    return 'The ticket service is temporarily down and no ticket was saved. Everything you entered is still here — try again in a moment.';
  }
  if (/\b(422|400)\b/.test(error.message)) {
    return 'The service rejected some details. Check the highlighted fields.';
  }
  return 'The ticket could not be created. Your details are still here — try again.';
}
