'use client';

import * as React from 'react';
import type { StoredTicket, TicketStatus } from '@/lib/ai-client';

/**
 * The ticket portal: "my tickets", and the follow-up conversation on one.
 *
 * This is the only read path back to a filed ticket. Everything else in the app
 * is in-memory and dies on refresh — `lib/store.tsx` holds the mirrored
 * `Report`, and reloading loses it. The Postgres row survives, so this is where
 * a reporter reconnects with what they actually submitted.
 *
 * Two conventions carried over from `lib/ai-client.ts`, both deliberate:
 *
 *  - Proxy paths only. The browser never learns `AI_API_URL`.
 *  - **Resolve rather than reject** on an expected failure. "You are not signed
 *    in" and "the service is down" are states this UI renders, not exceptions
 *    it catches. A rejection here would have to be turned back into a value
 *    anyway, and the ones worth handling are exactly the ones a `catch` block
 *    invites you to swallow.
 */

export interface TicketMessage {
  id: number;
  ticket_id: string;
  role: 'user' | 'assistant';
  text: string;
  created_at: string;
}

export interface FollowUpAnswer {
  reply: string;
  status: TicketStatus;
  status_detail: string;
  degraded: boolean;
  model: string;
  /**
   * Present when the model flagged that the reporter's message describes
   * something that needs a human now, regardless of the ticket's status. It is
   * an input to the reporter, never to the status: a model cannot promote a
   * ticket by saying so, only a responder can.
   */
  safety_note?: string;
}

/** Every non-happy outcome, as a value the UI can render directly. */
export type PortalError =
  | { kind: 'not_signed_in' }
  | { kind: 'forbidden' }
  | { kind: 'not_found' }
  | { kind: 'unreachable' }
  | { kind: 'unavailable' }
  | { kind: 'unknown'; message: string };

export type PortalResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: PortalError };

const TIMEOUT_MS = 45_000;

/**
 * Turn a fetch outcome into a `PortalResult`.
 *
 * The status codes are the interesting part. 401 is "sign in", 404 is "not
 * yours or not there" — deliberately indistinguishable, because the backend
 * answers 404 for a ticket the caller does not own so that guessing ids
 * reveals nothing. 503 is the database being down, which is retryable and
 * nothing to do with what the reporter typed.
 */
async function request<T>(path: string, init?: RequestInit): Promise<PortalResult<T>> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      ...init,
      signal: controller.signal,
      headers: init?.body
        ? { 'Content-Type': 'application/json', ...init?.headers }
        : init?.headers,
    });

    if (res.status === 401) return { ok: false, error: { kind: 'not_signed_in' } };
    if (res.status === 403) return { ok: false, error: { kind: 'forbidden' } };
    if (res.status === 404) return { ok: false, error: { kind: 'not_found' } };
    if (res.status === 502) return { ok: false, error: { kind: 'unreachable' } };
    if (res.status === 503) return { ok: false, error: { kind: 'unavailable' } };

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return {
        ok: false,
        error: { kind: 'unknown', message: detail.slice(0, 200) || `HTTP ${res.status}` },
      };
    }

    return { ok: true, value: (await res.json()) as T };
  } catch {
    // Network failure or the abort above. Same shape either way.
    return { ok: false, error: { kind: 'unreachable' } };
  } finally {
    window.clearTimeout(timer);
  }
}

export function fetchMyTickets(): Promise<PortalResult<{ tickets: StoredTicket[] }>> {
  return request('/api/ai/tickets');
}

export function fetchConversation(
  id: string,
): Promise<PortalResult<{ ticket: StoredTicket; messages: TicketMessage[] }>> {
  return request(`/api/ai/tickets/${encodeURIComponent(id)}/messages`);
}

export function sendFollowUp(
  id: string,
  message: string,
): Promise<PortalResult<FollowUpAnswer>> {
  return request(`/api/ai/tickets/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export function setTicketStatus(
  id: string,
  status: TicketStatus,
): Promise<PortalResult<StoredTicket>> {
  return request(`/api/ai/admin/tickets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function fetchAdminQueue(
  status?: TicketStatus,
): Promise<PortalResult<{ total: number; tickets: StoredTicket[] }>> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return request(`/api/ai/admin/tickets${query}`);
}

/**
 * Queue counts, for the top of `/admin`.
 *
 * `by_support` is keyed the same way the rest of the intake is: the raw
 * `SupportType` values, so one ticket with three support types is counted three
 * times and the row does not sum to `total`. The UI has to say that, or a
 * responder reads the mismatch as a bug and stops trusting the numbers.
 */
export interface TicketStats {
  total: number;
  by_status: Record<string, number>;
  by_urgency: Record<string, number>;
  by_support: Record<string, number>;
}

export function fetchAdminStats(): Promise<PortalResult<TicketStats>> {
  return request('/api/ai/admin/stats');
}

/**
 * Attach a ticket that was filed while signed out to the signed-in account.
 *
 * The proof is the reference plus the phone number the reporter gave when they
 * filed it. Both go in the body; the account comes from the session cookie, so
 * this can only ever claim a ticket *for the caller*.
 *
 * A wrong reference and a wrong phone are the same `not_found` on purpose. The
 * UI must not be able to say which one was wrong, and neither should a caller be
 * able to learn that a reference exists.
 */
export function claimTicket(
  ticketId: string,
  reporterPhone: string,
): Promise<PortalResult<StoredTicket>> {
  return request('/api/ai/tickets/claim', {
    method: 'POST',
    body: JSON.stringify({ ticketId, reporterPhone }),
  });
}

/**
 * One turn of a spoken intake.
 *
 * `role` is `reporter` / `assistant`, deliberately not the `user` / `assistant`
 * of the follow-up table. The two are different resources and the vocabularies
 * are kept apart on purpose — see the `ticket_transcripts` DDL note in
 * `ai-backend/app/db.py` for what mixing them would do to a follow-up prompt.
 */
export interface TranscriptTurn {
  seq: number;
  role: 'reporter' | 'assistant';
  text: string;
  created_at: string;
}

/**
 * The spoken intake of a ticket, as the two readers see it.
 *
 * `turns: []` is a real answer — the ticket was typed rather than spoken — so
 * callers must render that as a fact and not as a failure. Only
 * `PortalError.not_found` means the ticket is not theirs, and 404 is also what a
 * missing id gives, so the two are not distinguishable by design.
 */
export interface TicketTranscript {
  ticket_id: string;
  turns: TranscriptTurn[];
}

/** The reporter's own copy. 401 without a session, 404 for someone else's. */
export function fetchTranscript(id: string): Promise<PortalResult<TicketTranscript>> {
  return request(`/api/ai/tickets/${encodeURIComponent(id)}/transcript`);
}

/**
 * The operator's copy, for working a queue.
 *
 * Separate from `fetchTranscript` rather than a flag on it: the admin path is
 * gated by `requireAdmin()` in the proxy, and the reporter path by ownership in
 * the backend, and those are different guarantees about different people. A
 * boolean here would be a caller choosing which of the two rules to apply.
 */
export function fetchAdminTranscript(id: string): Promise<PortalResult<TicketTranscript>> {
  return request(`/api/ai/admin/tickets/${encodeURIComponent(id)}/transcript`);
}

/** Human wording for a failure, used where the UI has to say it inline. */
export function describePortalError(error: PortalError): string {
  switch (error.kind) {
    case 'not_signed_in':
      return 'You need to sign in to see this.';
    case 'forbidden':
      return 'Your account is not allowed to do that.';
    case 'not_found':
      return 'No such ticket on your account.';
    case 'unreachable':
      return 'The relief service could not be reached.';
    case 'unavailable':
      return 'The ticket service is temporarily down. Nothing was lost — try again in a moment.';
    default:
      return 'Something went wrong on our side. Your details are still here.';
  }
}

/* ------------------------------------------------------------------ *
 * Hooks
 * ------------------------------------------------------------------ */

const NO_MESSAGES: TicketMessage[] = [];
const NO_TURNS: TranscriptTurn[] = [];

export interface AsyncState<T> {
  data: T | null;
  error: PortalError | null;
  loading: boolean;
}

/**
 * Load the signed-in reporter's tickets, once, on mount.
 *
 * Not a general-purpose fetcher: it does not refetch on a timer and it does not
 * retry. Both would be wrong here. Someone checking whether help is coming will
 * reload the page, and silently retrying a request that failed *because* they
 * are signed out only delays the sign-in prompt.
 */
export function useMyTickets(): AsyncState<StoredTicket[]> & { reload: () => void } {
  const [state, setState] = React.useState<AsyncState<StoredTicket[]>>({
    data: null,
    error: null,
    loading: true,
  });
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    setState((prev) => ({ ...prev, loading: true }));
    void fetchMyTickets().then((result) => {
      if (!live) return;
      if (result.ok) {
        setState({ data: result.value.tickets, error: null, loading: false });
      } else {
        setState({ data: null, error: result.error, loading: false });
      }
    });
    return () => {
      live = false;
    };
  }, [nonce]);

  return { ...state, reload: () => setNonce((n) => n + 1) };
}

/**
 * Submit a claim for a ticket that was filed without an account.
 *
 * Kept separate from `useMyTickets` rather than folded into it, because the
 * failure copy differs: `describePortalError` says "no such ticket on your
 * account", which is actively wrong here — the ticket is not on anyone's account
 * yet, that is the whole problem. The claim form therefore renders the message
 * the proxy sends, not the generic one.
 *
 * `onClaimed` fires only on success, so the caller can reload the list without
 * this hook knowing anything about the list.
 */
export function useClaimTicket(onClaimed?: () => void): {
  claiming: boolean;
  error: string | null;
  clearError: () => void;
  claim: (ticketId: string, reporterPhone: string) => Promise<boolean>;
} {
  const [claiming, setClaiming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Held in a ref so a caller re-rendering mid-request cannot swap the callback
  // out from under an in-flight claim.
  const onClaimedRef = React.useRef(onClaimed);
  onClaimedRef.current = onClaimed;

  const claim = React.useCallback(async (ticketId: string, reporterPhone: string) => {
    setClaiming(true);
    setError(null);
    const result = await claimTicket(ticketId, reporterPhone);
    setClaiming(false);
    if (result.ok) {
      onClaimedRef.current?.();
      return true;
    }
    // A 404 here is the expected answer for a mistyped reference, and it is
    // deliberately the same message for a wrong phone. Everything else falls
    // back to the shared wording.
    setError(
      result.error.kind === 'not_found'
        ? 'That reference and phone number do not match a ticket. Check both and try again.'
        : describePortalError(result.error),
    );
    return false;
  }, []);

  const clearError = React.useCallback(() => setError(null), []);

  return { claiming, error, clearError, claim };
}

/**
 * The spoken intake of one ticket, loaded once on mount.
 *
 * A reporter reading their own filed ticket while waiting for a crew may want
 * to check what they actually said — a phone number transcribed wrongly is worth
 * catching while there is still time to correct it. So this is a first-class
 * read on the reporter's own page, not an admin-only artefact.
 *
 * `turns` is always an array, empty for a typed ticket, and the load is
 * independent of the conversation above it: `not_found` leaves the page able to
 * render the ticket itself rather than blanking it, because the transcript is a
 * record of how the ticket was taken and not the ticket.
 */
export function useTicketTranscript(id: string): AsyncState<TranscriptTurn[]> & {
  reload: () => void;
} {
  const [state, setState] = React.useState<AsyncState<TranscriptTurn[]>>({
    data: null,
    error: null,
    loading: true,
  });
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    setState((prev) => ({ ...prev, loading: true }));
    void fetchTranscript(id).then((result) => {
      if (!live) return;
      if (result.ok) {
        setState({ data: result.value.turns, error: null, loading: false });
      } else {
        setState({ data: null, error: result.error, loading: false });
      }
    });
    return () => {
      live = false;
    };
  }, [id, nonce]);

  return {
    ...state,
    data: state.data ?? NO_TURNS,
    reload: () => setNonce((n) => n + 1),
  };
}

/**
 * One ticket, its conversation, and a `send` that appends both turns.
 *
 * A message shown locally but not yet confirmed by the server carries
 * `pending: true`, and a confirmed send that failed carries `failed`. Both states
 * are rendered. Neither is silently collapsed, because a follow-up channel that
 * quietly drops a reporter's words is worse than one that cannot answer them —
 * and the backend agrees: it writes the user's turn *before* calling Gemini, so
 * the words are on the ticket even if the model is down.
 */
export interface PortalMessage extends TicketMessage {
  pending?: boolean;
  failed?: string;
  /**
   * A live safety flag on this turn, rendered above the reply.
   *
   * Deliberately *not* persisted: `ticket_messages` stores what was said, and a
   * note that mattered is one the reporter acted on or an operator saw. Replaying
   * stale advice ("call an ambulance now") on a later reload would be noise at
   * best and wrong at worst.
   */
  safetyNote?: string;
}

export interface TicketConversation {
  ticket: StoredTicket | null;
  messages: PortalMessage[];
  error: PortalError | null;
  loading: boolean;
  sending: boolean;
  /** Set when the last answer came from the degraded path. */
  degraded: boolean;
  send: (text: string) => Promise<void>;
}

/** Local-only ids, kept negative so they can never collide with a row id. */
let localSeq = 0;
function localMessage(
  ticketId: string,
  role: 'user' | 'assistant',
  text: string,
  extra?: Pick<PortalMessage, 'pending' | 'failed' | 'safetyNote'>,
): PortalMessage {
  localSeq -= 1;
  return {
    id: localSeq,
    ticket_id: ticketId,
    role,
    text,
    created_at: new Date().toISOString(),
    ...extra,
  };
}

export function useTicketConversation(id: string): TicketConversation {
  const [ticket, setTicket] = React.useState<StoredTicket | null>(null);
  const [messages, setMessages] = React.useState<PortalMessage[]>(NO_MESSAGES);
  const [error, setError] = React.useState<PortalError | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [degraded, setDegraded] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    setLoading(true);
    void fetchConversation(id).then((result) => {
      if (!live) return;
      if (result.ok) {
        setTicket(result.value.ticket);
        setMessages(result.value.messages);
        setError(null);
      } else {
        setError(result.error);
      }
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [id]);

  // `send` is async and outlives the render that created it, so it needs its own
  // liveness flag. The load effect's flag is scoped to that effect.
  const live = React.useRef(true);
  React.useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const sendingRef = React.useRef(false);
  const send = React.useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sendingRef.current) return;

      sendingRef.current = true;
      setSending(true);
      setDegraded(false);

      const optimistic = localMessage(id, 'user', trimmed, { pending: true });
      setMessages((prev) => [...prev, optimistic]);

      const result = await sendFollowUp(id, trimmed);
      if (!live.current) return;
      sendingRef.current = false;
      setSending(false);

      if (!result.ok) {
        // Keep the words, marked as not delivered. The reporter typed them
        // under stress; silently dropping them is the one outcome not allowed.
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimistic.id
              ? { ...m, pending: false, failed: describePortalError(result.error) }
              : m,
          ),
        );
        return;
      }

      setMessages((prev) => [
        ...prev.map((m) => (m.id === optimistic.id ? { ...m, pending: false } : m)),
        localMessage(id, 'assistant', result.value.reply, {
          safetyNote: result.value.safety_note || undefined,
        }),
      ]);
      setTicket((prev) => (prev ? { ...prev, status: result.value.status } : prev));
      setDegraded(result.value.degraded);
    },
    [id],
  );

  return { ticket, messages, error, loading, sending, degraded, send };
}
