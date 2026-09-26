import { NextResponse } from 'next/server';
import {
  AI_TIMEOUT_MS,
  MAX_MESSAGE_CHARS,
  MAX_TRANSCRIPT_MESSAGES,
  backendUnreachable,
  backendUrl,
  badRequest,
} from '../_shared';

/**
 * `POST /api/ai/chat` — proxy for `POST /api/chat/message` on the AI backend.
 *
 * Always dynamic: this reads a request body and the server-side `AI_API_URL`.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ProxyMessage {
  role: string;
  text: string;
}

const ROLES = new Set(['user', 'assistant']);

/** Discriminated on `ok` so the failure path narrows to a real string. */
type Validation =
  | { ok: true; messages: ProxyMessage[]; sessionId: string; editedDraft?: Record<string, string> }
  | { ok: false; error: string };

function validate(body: unknown): Validation {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const record = body as Record<string, unknown>;

  const rawMessages = record.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return { ok: false, error: '`messages` must be a non-empty array.' };
  }
  if (rawMessages.length > MAX_TRANSCRIPT_MESSAGES) {
    return { ok: false, error: `Transcript is limited to ${MAX_TRANSCRIPT_MESSAGES} messages.` };
  }

  const messages: ProxyMessage[] = [];
  for (const entry of rawMessages) {
    if (typeof entry !== 'object' || entry === null) {
      return { ok: false, error: 'Each message must be an object.' };
    }
    const { role, text } = entry as Record<string, unknown>;
    if (typeof role !== 'string' || !ROLES.has(role)) {
      return { ok: false, error: 'Each message needs a `role` of "user" or "assistant".' };
    }
    if (typeof text !== 'string' || text.trim().length === 0) {
      return { ok: false, error: 'Each message needs non-empty `text`.' };
    }
    messages.push({ role, text: text.slice(0, MAX_MESSAGE_CHARS) });
  }

  const sessionId =
    typeof record.sessionId === 'string' && record.sessionId.trim()
      ? record.sessionId.trim().slice(0, 64)
      : 'anonymous';

  // Edited values are re-sent by the client so a hand-corrected field is not
  // reverted by the next assistant turn. Coerced to strings here rather than
  // trusted, because this value is interpolated into the model prompt.
  let editedDraft: Record<string, string> | undefined;
  if (typeof record.editedDraft === 'object' && record.editedDraft !== null) {
    editedDraft = {};
    for (const [key, value] of Object.entries(record.editedDraft)) {
      if (typeof value === 'string' && value.trim()) {
        editedDraft[key.slice(0, 40)] = value.slice(0, 2000);
      }
    }
    if (Object.keys(editedDraft).length === 0) editedDraft = undefined;
  }

  return { ok: true, messages, sessionId, editedDraft };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  const parsed = validate(body);
  if (!parsed.ok) return badRequest(parsed.error);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${backendUrl()}/api/chat/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: parsed.messages,
        session_id: parsed.sessionId,
        edited_draft: parsed.editedDraft,
      }),
      signal: controller.signal,
    });

    // Pass the backend's status and body through untouched. The backend already
    // degrades a Gemini outage into a usable `degraded` turn, so a 200 here can
    // legitimately carry a "please try again" reply, and the store handles that
    // from the body rather than from the status code.
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return backendUnreachable(error);
  } finally {
    clearTimeout(timer);
  }
}
