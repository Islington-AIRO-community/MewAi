import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../_session';
import { AI_TIMEOUT_MS, backendUnreachable, backendUrl } from '../../../../_shared';

/**
 * `GET /api/ai/admin/tickets/[id]/transcript` — the spoken intake, for the queue.
 *
 * `requireAdmin()` is the entire access control, and that is the same bargain the
 * rest of `app/api/ai/admin/**` strikes: the backend's
 * `GET /api/tickets/{id}/transcript/admin` enforces nothing, and this handler is
 * the only reason a transcript of someone's emergency can be read at all. Which
 * means the AI backend must stay on a private network — `AI_API_URL` never
 * reaches the browser, so this proxy is the only door. If it is ever bound to a
 * public interface, put the check in the router first.
 *
 * A separate route from the reporter's rather than a flag on it. "Is an admin"
 * is a property of the route here, so it is visible in the routing table instead
 * of being a condition inside a handler that serves both audiences.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
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
    const upstream = await fetch(
      `${backendUrl()}/api/tickets/${encodeURIComponent(params.id)}/transcript/admin`,
      { method: 'GET', signal: controller.signal },
    );

    if (upstream.status === 404) {
      return NextResponse.json(
        { error: 'No such ticket.', code: 'not_found' },
        { status: 404 },
      );
    }

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
