import { NextResponse } from 'next/server';
import { requireAdmin } from '../../_session';
import { AI_TIMEOUT_MS, backendUnreachable, backendUrl } from '../../_shared';

/**
 * `/api/ai/admin/tickets` — the admin queue, proxied.
 *
 * The backend's `GET /api/tickets` is labelled "(admin)" and enforces nothing.
 * It is safe today only because `AI_API_URL` never reaches the browser, so this
 * proxy is the entire access control for the whole queue — every victim's name,
 * phone number, address and stated urgency.
 *
 * `requireAdmin()` therefore runs here, server-side, on every request. It reads
 * the session cookie and checks the address against `ADMIN_EMAILS`, which
 * admits nobody when unset. `middleware.ts` gates `/admin` too, but that is a
 * redirect: a matcher can be routed around, so the check that matters is the one
 * on the response path.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const allowed = await requireAdmin();
  if (!allowed.ok) {
    return NextResponse.json(
      { error: 'Not authorised.', code: 'forbidden' },
      { status: 403 },
    );
  }

  // Only these two query parameters are forwarded. Anything else a caller adds
  // is dropped rather than passed through, so this cannot become a way to reach
  // a different upstream route.
  const incoming = new URL(request.url).searchParams;
  const limit = incoming.get('limit') ?? '100';
  const status = incoming.get('status');

  const upstreamUrl = new URL(`${backendUrl()}/api/tickets`);
  upstreamUrl.searchParams.set('limit', limit);
  if (status) upstreamUrl.searchParams.set('status', status);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const upstream = await fetch(upstreamUrl, {
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
