import { NextResponse } from 'next/server';
import { AI_TIMEOUT_MS, backendRefused, backendUnreachable, backendUrl } from '../../_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Mint a short-lived Gemini Live token so the browser can open a voice session.
 *
 * The one route in `/api/ai/*` that does not fully insulate the browser from
 * the backend: the Live *WebSocket* has to be opened by the browser, because a
 * Next route handler cannot proxy a `101 Switching Protocols` upgrade. What this
 * route preserves is the important half — the Gemini API key never leaves the
 * server. What the browser receives is a single-use token, dead within minutes,
 * and useless without a handshake inside a two-minute window.
 *
 * No session is required, and requiring one would be a mistake: `/chat` is
 * deliberately open (`middleware.ts` gates only `/reports`, `/tickets` and
 * `/admin`), so this must not become a login wall in front of intake.
 *
 * The `AbortController` here is a token *mint*, not a session. It is safe to
 * time out at `AI_TIMEOUT_MS` precisely because nothing long-lived flows through
 * this handler — a rule that would not hold if this ever proxied the socket.
 */
export async function POST() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${backendUrl()}/api/live/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });

    // Refusals are re-shaped, successes pass straight through. The body is a
    // token, so it is forwarded verbatim rather than parsed and rebuilt: there
    // is no second place where a token could be dropped or logged.
    if (!upstream.ok) {
      let message = 'Voice is starting unavailable.';
      try {
        const body = (await upstream.json()) as { detail?: unknown };
        if (typeof body.detail === 'string' && body.detail.trim()) {
          message = body.detail;
        }
      } catch {
        // A non-JSON upstream body is not worth surfacing; the default is
        // already an honest sentence.
      }
      return backendRefused(message);
    }

    return new NextResponse(await upstream.text(), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return backendUnreachable(error);
  } finally {
    clearTimeout(timer);
  }
}
