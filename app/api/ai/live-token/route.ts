import { NextResponse } from 'next/server';
import { AI_TIMEOUT_MS, backendUnreachable, backendUrl } from '../_shared';

/**
 * `POST /api/ai/live-token` — proxy for `POST /api/live/token` on the backend.
 *
 * ## Why a token and not a WebSocket proxy
 *
 * Next.js route handlers cannot proxy WebSockets, and the backend is on a
 * private network the browser cannot reach anyway. So the split is:
 *
 *   browser ──► this route ──► FastAPI mints a single-use ephemeral token
 *   browser ─────────────────► opens its own wss:// socket to Google
 *
 * The socket therefore never touches `ai-backend`, which is what keeps the
 * invariant that this service stays on a private network.
 *
 * ## Why this route is rate limited and the others are not
 *
 * This is the only endpoint where an **anonymous** visitor causes spend against
 * the Gemini quota. `/api/ai/chat` is unmetered and unmapped, but a token mint
 * is a billable, quota-consuming object, and intake is deliberately open to
 * signed-out people — a person asking for help during a disaster has no
 * account and possibly no way to get one.
 *
 * The cap is per IP, in memory, and generous: enough that a person retrying
 * after a dropped connection never sees it, and low enough that a loop cannot
 * drain the quota. It resets on redeploy, which is the right trade for a
 * single-process deployment and the wrong one behind many instances — at that
 * point move the counter to the shared store rather than raising the number.
 *
 * Always dynamic: reads the server-side `AI_API_URL` and the client IP.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 6 mints per IP per minute. */
const MAX_MINTS_PER_WINDOW = 6;
const WINDOW_MS = 60_000;

const hits = new Map<string, number[]>();

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    // Left-most entry is the original client when behind a proxy we control.
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_MINTS_PER_WINDOW) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

/** Drop idle IPs so the map cannot grow without bound. */
function sweep(now: number): void {
  if (hits.size < 512) return;
  for (const [ip, times] of hits) {
    const live = times.filter((t) => now - t < WINDOW_MS);
    if (live.length === 0) hits.delete(ip);
    else hits.set(ip, live);
  }
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  const now = Date.now();
  sweep(now);

  if (rateLimited(ip)) {
    return NextResponse.json(
      {
        error:
          'Too many voice sessions started from this connection. Please try again in a minute, or continue in text.',
        code: 'rate_limited',
      },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${backendUrl()}/api/live/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });

    const text = await upstream.text();

    // The backend answers 503 when Gemini is unreachable or the key is
    // missing, which is the "use text instead" signal. Pass the status and
    // body through untouched rather than inventing one here, so the client
    // sees the same vocabulary it sees everywhere else.
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    // Our network to the backend is down. Distinct from the 503 above, which
    // means the backend is up and Gemini is not.
    return backendUnreachable(error);
  } finally {
    clearTimeout(timer);
  }
}
