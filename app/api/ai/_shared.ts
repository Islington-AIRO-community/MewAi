import { NextResponse } from 'next/server';

/**
 * Shared plumbing for the `/api/ai/*` proxy.
 *
 * `app/api/ai/chat/route.ts` and `app/api/ai/tickets/route.ts` are thin: they
 * forward to the FastAPI service and pass its status and body straight through.
 *
 * Why a proxy at all, when the browser could call FastAPI directly:
 *
 *  - the Gemini key stays on the server. Nothing in this app reads
 *    `NEXT_PUBLIC_*` for anything sensitive, and a `NEXT_PUBLIC_` URL here would
 *    invite someone to "fix" it by making the whole backend public.
 *  - one origin, so there is no CORS negotiation in the request path and no
 *    second thing to configure when this is deployed.
 *  - a single `AI_API_URL` env var to change, instead of a URL baked into the
 *    client bundle at build time.
 */

const DEFAULT_BASE_URL = 'http://127.0.0.1:8000';

/** Server-side only. Read here rather than in a client component on purpose. */
export function backendUrl(): string {
  return (process.env.AI_API_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
}

export const AI_TIMEOUT_MS = 60_000;

/**
 * The backend is not reachable.
 *
 * This is the case the store cares about most: it needs to fall back to the
 * scripted demo replies rather than showing the user a dead end. `502` says
 * "upstream unreachable" as opposed to `500` "upstream broke", which matters
 * when reading logs.
 */
export function backendUnreachable(error: unknown): NextResponse {
  const message =
    error instanceof Error && error.name === 'AbortError'
      ? 'The relief assistant did not respond in time.'
      : 'The relief assistant is unreachable.';
  return NextResponse.json(
    { error: message, code: 'backend_unreachable' },
    { status: 502 },
  );
}

export function badRequest(message: string, detail?: unknown): NextResponse {
  return NextResponse.json(
    { error: message, detail: detail ?? null },
    { status: 400 },
  );
}

/** Guard against an enormous transcript arriving in one request. */
export const MAX_TRANSCRIPT_MESSAGES = 60;
export const MAX_MESSAGE_CHARS = 4000;
