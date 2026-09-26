'use client';

import * as React from 'react';
import {
  createTicket,
  emptyDraft,
  isRequestRejection,
  AiRequestError,
  sendChatTurn,
  WIRE_LIMITS,
  type ChatTurnResult,
  type SlotName,
  type StoredTicket,
  type TicketDraft,
  type WireMessage,
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
  /**
   * Record how the reporter arrived — a category tile they tapped, say — as
   * context for the model and a visible system line. Never a user utterance:
   * the reporter did not type it, and telling Gemini they did would be a
   * fabrication with consequences for what the model believes they need.
   */
  noteIntent: (text: string) => void;
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
  /**
   * Close the review form and keep talking about the same emergency. The model
   * keeps its context; the draft is cleared.
   */
  reset: () => void;
  /**
   * Start a separate emergency in the same conversation.
   *
   * The visible transcript is kept and the model's context is cut, so the next
   * ticket starts from what the reporter says next rather than inheriting the
   * previous one's name, phone and urgency. The `sessionId` is unchanged, so both
   * tickets are still grouped as one conversation server-side.
   */
  startNewCase: () => void;
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

/**
 * Draft field -> `SlotName`, for the `known_facts` block.
 *
 * Strictly the nine slots. `notes` is free text the reporter adds rather than a
 * fact the model established, so it is not a fact and must not appear here — the
 * backend's `_clean_facts` drops any key that is not a real `SlotName` anyway,
 * so sending one would be noise at best.
 */
const FIELD_TO_SLOT: Partial<Record<keyof TicketDraft, SlotName>> = Object.fromEntries(
  (Object.entries(SLOT_TO_FIELD) as [SlotName, keyof TicketDraft][]).map(([slot, field]) => [
    field,
    slot,
  ]),
) as Partial<Record<keyof TicketDraft, SlotName>>;

/**
 * Draft field -> the key the backend's `_apply_edits` matches on.
 *
 * For the nine slots that key is the `SlotName` itself, which is why `edits` is
 * keyed that way at all — the draft is keyed by snake_case because that is what
 * the wire uses, and the form edits the draft, so the mapping has to happen here.
 * Keying `edits` by the draft field name instead meant every hand correction was
 * silently dropped on the way to `_apply_edits`, and a reporter's fix to their
 * own address evaporated on the next turn.
 *
 * Wider than `FIELD_TO_SLOT` by exactly one field. `notes` is editable and the
 * backend has a `case "notes"` for it, but it has no `SlotName`, so it was being
 * dropped from this end: the old lookup returned `undefined` and the edit never
 * left the browser. Same failure as the keying bug above, from the opposite end.
 */
const FIELD_TO_EDIT_KEY: Partial<Record<keyof TicketDraft, string>> = {
  ...FIELD_TO_SLOT,
  notes: 'notes',
};

/**
 * The reverse, derived from the same table rather than written out again so the
 * two cannot drift.
 *
 * This is what notices an edit the reporter has since changed and drops it, so a
 * stale correction cannot pin a field to a value they just fixed.
 */
const EDIT_KEY_TO_FIELD = Object.fromEntries(
  Object.entries(FIELD_TO_EDIT_KEY).map(([field, key]) => [key, field]),
) as Record<string, keyof TicketDraft>;

/**
 * The draft as a `SlotName` -> string map, for the facts block.
 *
 * `support_needed` and `urgency` are serialised rather than skipped: they are
 * real answers, and a model that cannot see the classification it already made
 * will ask about them again. Everything empty is dropped, so the block stays
 * proportional to what has actually been established.
 */
function knownFactsFrom(draft: TicketDraft): Record<string, string> | undefined {
  const facts: Record<string, string> = {};
  for (const [field, slot] of Object.entries(FIELD_TO_SLOT) as [
    keyof TicketDraft,
    SlotName,
  ][]) {
    const value = draft[field];
    if (value === null || value === undefined) continue;
    const serialised = Array.isArray(value) ? value.join(', ') : String(value);
    if (serialised.trim()) facts[slot] = serialised.slice(0, WIRE_LIMITS.maxMessageChars);
  }
  return Object.keys(facts).length ? facts : undefined;
}

export function useAiChat(): AiChatApi {
  const {
    sendMessage,
    appendAssistantMessage,
    appendSystemMessage,
    scriptedReplyFor,
    createReportFromTicket,
  } = useApp();
  const [state, setState] = React.useState<AiChatState>(INITIAL);

  // Stable per mount: groups this ticket with the conversation it came from,
  // and is what the admin view will key on later.
  const sessionId = React.useRef(
    typeof window === 'undefined' ? 'ssr' : `sess-${makeId('x').slice(2)}`,
  );

  // The transcript Gemini is shown for the case currently being taken.
  //
  // It starts empty, and that is the fix for a serious bug rather than a
  // preference: this used to be seeded from the store's `INITIAL_MESSAGES`, so
  // the demo's fabricated conversation — a trapped family at Fairmount
  // Apartments, a neighbour named Mr. Whitfield — was replayed to Gemini as
  // though the reporter had said all of it. The model then answered *that*
  // incident. It also meant a new visitor's first turn arrived with seven
  // turns of someone else's emergency in context.
  //
  // The store's visible transcript is now empty for the same reason, so there is
  // one rule rather than two: what the reporter sees is what the model is sent.
  const transcript = React.useRef<WireMessage[]>([]);

  // Hand-edited values, re-sent on every turn so a correction in the review
  // form is never reverted by the model's next answer.
  const edits = React.useRef<Record<string, string>>({});

  /**
   * Things the reporter did rather than said.
   *
   * `/chat?intent=medical` used to synthesise a first-person sentence — "I need
   * help with medical. …" — and send it as a *user* turn. That put words in the
   * reporter's mouth in the transcript they can see, and told Gemini they had
   * said it. A category is a real fact about how they arrived, so it is sent as
   * a fact and never as an utterance.
   */
  const context = React.useRef<string[]>([]);

  const noteIntent = React.useCallback(
    (text: string) => {
      const line = text.trim();
      if (!line || context.current.includes(line)) return;
      context.current = [...context.current, line].slice(-8);
      appendSystemMessage(line);
    },
    [appendSystemMessage],
  );

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

      // What the model is told it already knows, and the one block it must
      // treat as authoritative. Sent together: the facts are what survives the
      // transcript window, and the corrections are what must never be
      // overwritten by anything the model says next.
      const facts = knownFactsFrom(state.draft);
      const corrections = Object.keys(edits.current).length
        ? ({ ...edits.current } as Partial<Record<SlotName, string>>)
        : undefined;

      const request = {
        messages: transcript.current,
        sessionId: sessionId.current,
        knownFacts: facts,
        editedDraft: corrections,
        context: context.current.length ? context.current : undefined,
      };

    try {
      let turn: ChatTurnResult;
      try {
        turn = await sendChatTurn(request);
      } catch (error) {
        if (!isRequestRejection(error)) throw error;
        // Reached the service, and it said no. The only cause at this size is
        // the request being too big, so try once with a much smaller window
        // before giving up — a single dropped turn is a real cost to someone
        // mid-emergency, and it is recoverable.
        turn = await sendChatTurn({
          ...request,
          maxChars: Math.floor(WIRE_LIMITS.maxChars / 2),
        });
      }


      const draft = mergeDraft(state.draft, turn.draft);
      const missing = turn.missing ?? missingSlots(draft);
      transcript.current = [...transcript.current, { role: 'assistant', text: turn.reply }];

      appendAssistantMessage({
        text: turn.reply,
        confidence: turn.confidence,
        offline: turn.degraded,
      });

      // Drop edits for values the user has since changed, so a stale correction
      // cannot pin a field to something they just fixed. Walked through
      // `EDIT_KEY_TO_FIELD` rather than `SLOT_TO_FIELD` so `notes` is pruned
      // too — a `notes` edit that outlived the text it corrected would keep
      // re-applying itself on every later turn.
      for (const key of Object.keys(edits.current)) {
        const field = EDIT_KEY_TO_FIELD[key];
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
        error: '',
      }));
    } catch (error) {
      // Both failures below put a *non-model* answer in the transcript, so both
      // mark it `offline` — that badge means "this did not come from the
      // assistant", which is true either way. What differs is what we tell the
      // reporter about why, and that difference is the whole point of `AiRequestError`.
      const fallback = scriptedReplyFor(trimmed);
      transcript.current = [...transcript.current, { role: 'assistant', text: fallback.text }];
      appendAssistantMessage({ ...fallback, offline: true });

      if (isRequestRejection(error)) {
        // The service is up and working. This request was refused twice, which
        // is a defect on our side. Reporting it as an outage would be the worst
        // possible answer here: it tells someone mid-emergency to stop using
        // the one channel that works, on the strength of a bug.
        setState((prev) => ({
          ...prev,
          busy: false,
          offline: true,
          error: 'The assistant could not accept this message. Your details are still here — try again in a moment.',
        }));
        return;
      }

      // Backend down, key wrong, or a network blip. Fall back to the scripted
      // reply so the transcript is not left hanging on a typing indicator, and
      // mark it `offline` so the UI says where the answer came from.
      setState((prev) => ({ ...prev, busy: false, offline: true }));
    }
    // `state.draft` is the draft as it was when this turn was sent, which is the
    // correct thing to merge the answer into. It re-creates the callback on
    // every keystroke in the review form, which is harmless.
  }, [sendMessage, appendAssistantMessage, scriptedReplyFor, state.draft]);

  const edit = React.useCallback((patch: Partial<TicketDraft>) => {
    setState((prev) => {
      const draft = { ...prev.draft, ...patch };
      // Record the edit so the next assistant turn cannot revert it. Keyed by
      // the key `_apply_edits` matches on, not by the draft's field name: that
      // is what made corrections vanish.
      for (const [field, value] of Object.entries(patch) as [
        keyof TicketDraft,
        unknown,
      ][]) {
        const key = FIELD_TO_EDIT_KEY[field];
        if (key && typeof value === 'string' && value.trim()) edits.current[key] = value;
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
      // A toggle is the reporter choosing between options the model offered, not
      // a correction of a value, so it must stop overriding the model.
      delete edits.current.supportNeeded;
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

  /**
   * Close the review form and go back to the conversation.
   *
   * The model context is kept, which is the part that matters here: someone who
   * opened the form to check a detail and came back should not have to answer
   * the same questions from scratch. Starting a genuinely different emergency is
   * `startNewCase`, which cuts the context.
   *
   * Note the draft is still cleared, which is long-standing behaviour and
   * arguably wrong — the "Back to the conversation" button in the review form
   * claims to preserve a half-filled report and does not. Left as-is rather than
   * changed here, because silently making "back" mean "keep everything" would
   * blur the two intentions this pair of functions exists to separate.
   */
  const reset = React.useCallback(() => {
    edits.current = {};
    setState({ ...INITIAL, draft: emptyDraft(), missing: missingSlots(emptyDraft()) });
  }, []);

  /**
   * Begin a separate emergency in the same conversation.
   *
   * This is the case boundary. The visible transcript stays — the reporter
   * should not lose what they already told us, and a second case in the same
   * session is normal — but the *wire* transcript is cleared, so the model
   * stops answering about Fairmount Apartments once the conversation has moved
   * to a different address. The `sessionId` is also kept, which is what lets
   * the backend group both tickets as one conversation rather than two strangers.
   *
   * Without this, everything either ticket needs bled into the other: the
   * second ticket inherited the first one's name, phone and urgency.
   */
  const startNewCase = React.useCallback(() => {
    edits.current = {};
    transcript.current = [];
    context.current = [];
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
    noteIntent,
    edit,
    toggleSupport,
    setOnBehalf,
    openReview,
    reset,
    startNewCase,
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

/**
 * Pull the backend's rejected field list out of a failed request.
 *
 * Read from `error.body`, not `error.message`. The message is the body truncated
 * to 200 characters, so a 422 with more than a couple of fields in it was cut off
 * mid-array and this returned `[]` — the form then showed the error banner and
 * highlighted nothing, which is worse than no highlight at all.
 */
function rejectedSlots(error: unknown): SlotName[] {
  if (!(error instanceof AiRequestError)) return [];
  const match = error.body.match(/"missing":\s*\[([^\]]*)\]/);
  if (!match) return [];
  const names = match[1]
    .split(',')
    .map((s) => s.trim().replace(/"/g, ''))
    .filter(Boolean);
  return names.filter((name): name is SlotName => name in SLOT_TO_FIELD);
}

/**
 * What to tell the reporter when filing fails.
 *
 * Keyed on the status code rather than matched against the error text, because
 * the two outages here mean opposite things: `502` is our network to the service,
 * `503` is the service with no database. Telling someone their ticket is safe
 * when it was never written, or that the service is gone when it is merely
 * unreachable, costs them the one durable thing this app has.
 */
function ticketErrorMessage(error: unknown): string {
  if (!(error instanceof AiRequestError)) {
    return 'The ticket could not be created. Your details are still here — try again.';
  }
  if (error.status === 502 || error.body.includes('backend_unreachable')) {
    return 'The relief service could not be reached. Your details are still here — try again in a moment.';
  }
  if (error.status === 503) {
    return 'The ticket service is temporarily down and no ticket was saved. Everything you entered is still here — try again in a moment.';
  }
  if (error.status === 400 || error.status === 422) {
    return 'The service rejected some details. Check the highlighted fields.';
  }
  return 'The ticket could not be created. Your details are still here — try again.';
}
