import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../_session';
import { AI_TIMEOUT_MS, backendUnreachable, backendUrl, badRequest } from '../../../_shared';

/**
 * `PATCH /api/ai/admin/tickets/[id]` — move a ticket along its lifecycle.
 *
 * This is the only way a ticket ever leaves `submitted`, and therefore the only
 * way the reporter's status badge changes. It is a proxy for the backend's
 * `PATCH /api/tickets/{id}/status`, which is validated against the
 * `TicketStatus` enum upstream and rejects anything else.
 *
 * Allowlist enforced here, for the same reason as the queue read: the backend
 * endpoint has no authentication and this is the only thing standing in front
 * of it.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STATUSES = new Set(['submitted', 'under_review', 'dispatched', 'resolved', 'closed']);

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const allowed = await requireAdmin();
  if (!allowed.ok) {
    return NextResponse.json(
      { error: 'Not authorised.', code: 'forbidden' },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  const status = (body as { status?: unknown } | null)?.status;
  if (typeof status !== 'string' || !STATUSES.has(status)) {
    return badRequest(`\`status\` must be one of: ${[...STATUSES].join(', ')}.`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const upstream = await fetch(
      `${backendUrl()}/api/tickets/${encodeURIComponent(params.id)}/status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
        signal: controller.signal,
      },
    );
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
