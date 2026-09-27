import { NextResponse } from 'next/server';
import { requireAdmin } from '../../_session';
import { AI_TIMEOUT_MS, backendUnreachable, backendUrl } from '../../_shared';

/**
 * `/api/ai/admin/stats` — queue counts, proxied.
 *
 * Same reasoning as `app/api/ai/admin/tickets/route.ts`, and the same reason the
 * check has to be on the response path rather than only in `middleware.ts`:
 * `AI_API_URL` never reaches the browser, so this proxy is the whole of the
 * access control for the backend's `GET /api/tickets/stats`, which enforces
 * nothing by itself. Unset `ADMIN_EMAILS` admits nobody.
 *
 * Counts are aggregate, so this is far less sensitive than the queue itself —
 * but it is still a view of a live incident response, and it is the kind of
 * number that must not be published to the internet during one. The allowlist
 * is cheap, so it is applied anyway.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const allowed = await requireAdmin();
  if (!allowed.ok) {
    return NextResponse.json(
      { error: 'Not authorised.', code: 'forbidden' },
      { status: 403 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${backendUrl()}/api/tickets/stats`, {
      method: 'GET',
      signal: controller.signal,
    });
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return backendUnreachable(error);
  } finally {
    clearTimeout(timer);
  }
}
