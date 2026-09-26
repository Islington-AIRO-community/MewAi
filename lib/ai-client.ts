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

export interface StoredTicket {
  id: string;
  created_at: string;
  updated_at: string;
  status: 'submitted' | 'under_review' | 'dispatched' | 'resolved' | 'closed';
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
      const detail = await res.text();
      throw new Error(`AI backend ${res.status}: ${detail.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

export interface ChatTurnInput {
  messages: { role: 'user' | 'assistant'; text: string }[];
  sessionId: string;
  /** Hand-edited field values that must survive this turn. */
  editedDraft?: Partial<Record<string, string>>;
}

export function sendChatTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
  return postJson<ChatTurnResult>('/api/ai/chat', input);
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
}

export function createTicket(input: CreateTicketInput): Promise<StoredTicket> {
  return postJson<StoredTicket>('/api/ai/tickets', input);
}
