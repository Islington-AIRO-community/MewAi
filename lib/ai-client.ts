import type { SupportType } from '@/lib/types';

/**
 * Typed client for the AI backend.
 *
 * Talks to the Next.js proxy at `/api/ai/*` rather than to FastAPI directly, so
 * the browser never holds the backend URL or the Gemini key and there is no
 * CORS negotiation in the request path.
 *
 * Every function here resolves rather than rejecting on an expected failure —
 * the store decides what the user sees, and "the assistant is unavailable" is a
 * state the UI has to render, not an exception it has to catch.
 */

export interface TicketDraft {
  reporter_name: string;
  reporter_phone: string;
  victim_name: string;
  victim_phone: string;
  summary: string;
  location: string;
  people_affected: string;
  support_needed: SupportType[];
  urgency: 'critical' | 'high' | 'medium' | 'low' | null;
  on_behalf_of_other: boolean;
  notes: string;
}

/** Mirrors `SlotName` in `ai-backend/app/schemas.py`. */
export type SlotName =
  | 'reporterName'
  | 'reporterPhone'
  | 'victimName'
  | 'victimPhone'
  | 'summary'
  | 'location'
  | 'supportNeeded'
  | 'urgency'
  | 'peopleAffected';

export type CaptureState = 'captured' | 'needed' | 'unknown';

export interface ChatTurnResult {
  reply: string;
  draft: TicketDraft;
  slots: Record<SlotName, CaptureState>;
  missing: SlotName[];
  next_questions: SlotName[];
  is_complete: boolean;
  safety_note: string;
  confidence: number;
  model: string;
  /** True when the backend could not reach Gemini and asked a fallback question. */
  degraded: boolean;
}

/**
 * Lifecycle, mirrored from `TicketStatus` in `ai-backend/app/schemas.py`.
 *
 * The reporter-facing wording is not these values — see
 * `components/assistant/ticket-status.tsx`, which collapses five states into
 * the three that are meaningful to someone waiting for help.
 */
export type TicketStatus =
  | 'submitted'
  | 'under_review'
  | 'dispatched'
  | 'resolved'
  | 'closed';

export interface StoredTicket {
  id: string;
  created_at: string;
  updated_at: string;
  status: TicketStatus;
  reporter_name: string;
  reporter_phone: string;
  victim_name: string;
  victim_phone: string;
  summary: string;
  location: string;
  people_affected: number | null;
  support_needed: SupportType[];
  urgency: 'critical' | 'high' | 'medium' | 'low';
  on_behalf_of_other: boolean;
  notes: string;
  source: string;
  session_id: string | null;
  /**
   * The Google account this ticket was filed under, or `null` when it was
   * filed signed out.
   *
   * Set by the proxy from the httpOnly session cookie and never from the
   * request body — see `app/api/ai/tickets/route.ts`. Intake is deliberately
   * open to signed-out people, so a `null` here is a normal outcome and not an
   * error: that ticket is real and will be worked, it just cannot be tracked
   * from the portal later.
   */
  owner_email: string | null;
}

/** An empty draft, so the review form always binds to a complete shape. */
export function emptyDraft(): TicketDraft {
  return {
    reporter_name: '',
    reporter_phone: '',
    victim_name: '',
    victim_phone: '',
    summary: '',
    location: '',
    people_affected: '',
    support_needed: [],
    urgency: null,
    on_behalf_of_other: false,
    notes: '',
  };
}

const TIMEOUT_MS = 45_000;

/**
 * A response the proxy or the backend actually returned.
 *
 * This is separate from a thrown `Error` on purpose. "The assistant is
 * unavailable" is a state the UI renders, and the caller has to be able to tell
 * it apart from "our request was wrong" — the two need different copy and
 * different recovery. A 4xx means this client sent something the service
 * rejected; a network failure or a timeout means the service could not be
 * reached. Collapsing them into one `Error` made a rejected request render as
 * an outage, which is a lie told to someone waiting for help.
 */
export class AiRequestError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`AI backend ${status}: ${body.slice(0, 200)}`);
    this.name = 'AiRequestError';
    this.status = status;
    this.body = body;
  }
}

/** True for failures where the service was reached and rejected the request. */
export function isRequestRejection(error: unknown): error is AiRequestError {
  return error instanceof AiRequestError && error.status >= 400 && error.status < 500;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new AiRequestError(res.status, await res.text());
    }
    return (await res.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

/** One turn as the model sees it. */
export type WireMessage = { role: 'user' | 'assistant'; text: string };

/**
 * The wire limits, mirrored from `app/api/ai/_shared.ts` and
 * `ai-backend/app/schemas.py`.
 *
 * `maxMessages` and `maxMessageChars` are the proxy's hard rejection, so
 * `boundTranscript` never has to hit them. `maxChars` is this client's own
 * budget: a transcript that is individually legal can still be large enough to
 * blow the model's context or cost a fortune to resend on every turn, and the
 * fix is to stop accumulating rather than to fail the request.
 */
export const WIRE_LIMITS = {
  maxMessages: 60,
  maxMessageChars: 4_000,
  maxChars: 24_000,
  /**
   * Never drop below this many turns, however tight the budget.
   *
   * The newest turns are the only ones that matter for "what do they need next",
   * but a window of zero or one would send the model an exchange with no
   * question in it, and it would answer the wrong thing. The facts block, not
   * the window, is what preserves anything older.
   */
  minMessages: 6,
} as const;

/**
 * Keep the newest turns that fit the budget, dropping from the oldest.
 *
 * Replaying the whole conversation on every turn is what made intake die around
 * turn 28: the transcript grew without bound until the proxy rejected it, and
 * the hook reported that rejection as an outage. Bounding here means the
 * request is always legal, and old context is carried by `knownFacts` instead —
 * a structured, confirmed fact is a better summary of turn 4 than turn 4's
 * prose is.
 */
export function boundTranscript(
  messages: WireMessage[],
  maxChars: number = WIRE_LIMITS.maxChars,
): WireMessage[] {
  const trimmed = messages
    .slice(-WIRE_LIMITS.maxMessages)
    .map((m) => ({ ...m, text: m.text.slice(0, WIRE_LIMITS.maxMessageChars) }));

  // Walk backwards accumulating until the budget is spent, then reverse back
  // into chronological order. Costs the newest turn the least, which is the one
  // the model has to answer.
  const kept: WireMessage[] = [];
  let total = 0;
  for (let i = trimmed.length - 1; i >= 0; i -= 1) {
    const message = trimmed[i];
    const cost = message.text.length;
    if (kept.length >= WIRE_LIMITS.minMessages || total + cost <= maxChars) {
      kept.unshift(message);
      total += cost;
    } else {
      break;
    }
  }
  return kept;
}

export interface ChatTurnInput {
  /**
   * The recent conversation, oldest first. Bounded by `sendChatTurn`, so a
   * caller may pass everything it has.
   */
  messages: WireMessage[];
  sessionId: string;
  /**
   * Slots the model has already confirmed, keyed by `SlotName`.
   *
   * This is the replacement for replaying the whole transcript. It survives the
   * window trim, so a fact stated in turn 3 is still there in turn 30 — as a
   * value rather than as prose the model has to re-read and re-infer.
   */
  knownFacts?: Record<string, string>;
  /**
   * Hand-edited values that must survive this turn. The only block the model
   * is told to treat as authoritative.
   */
  editedDraft?: Partial<Record<SlotName, string>>;
  /**
   * Things the reporter did rather than said, e.g. the category tile they
   * arrived through. Rendered as context, never as an utterance.
   */
  context?: string[];
  /**
   * Cap the transcript harder than the default. Used for the single retry after
   * a rejected request, where the cause is known to be size.
   */
  maxChars?: number;
}

export function sendChatTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
  const { maxChars, ...rest } = input;
  return postJson<ChatTurnResult>('/api/ai/chat', {
    ...rest,
    messages: boundTranscript(rest.messages, maxChars),
  });
}


export interface CreateTicketInput {
  reporter_name: string;
  reporter_phone: string;
  victim_name: string;
  victim_phone: string;
  summary: string;
  location: string;
  people_affected: string | number | null;
  support_needed: SupportType[];
  urgency: 'critical' | 'high' | 'medium' | 'low';
  on_behalf_of_other: boolean;
  notes: string;
  session_id: string;
  /**
   * How the ticket was filed. Optional because the proxy is the authority here
   * and defaults to `'ai-chat'`, so a caller that omits it gets the ordinary
   * case rather than having to know the vocabulary. The proxy allowlists it —
   * `'ai-chat'` or `'sos'` — so this cannot be used to write an arbitrary
   * string into the row.
   */
  source?: TicketSource;
}

/** The only two values the proxy will accept. */
export type TicketSource = 'ai-chat' | 'sos';

export function createTicket(input: CreateTicketInput): Promise<StoredTicket> {
  return postJson<StoredTicket>('/api/ai/tickets', input);
}
