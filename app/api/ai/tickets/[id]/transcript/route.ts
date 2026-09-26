import { NextResponse } from 'next/server';
import { sessionEmail } from '../../../_session';
import { AI_TIMEOUT_MS, backendUnreachable, backendUrl } from '../../../_shared';

/**
 * `GET /api/ai/tickets/[id]/transcript` — the spoken intake, for its reporter.
 *
 * Separate from `app/api/ai/tickets/[id]/route.ts` rather than added as a field
 * on it, because the two have different failure modes and the portal needs to be
 * able to tell them apart. The ticket route is essential to rendering the page;
 * the transcript is a record of how it was taken. A reporter on one bar of
 * signal who cannot get their transcript should still get their ticket, and a
 * database that is briefly unhappy about a second table should not take the
 * ticket page with it.
 *
 * A ticket filed by typing has no transcript, and that is a `200` with an empty
 * list — see the backend for why it is not a 404.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const email = await sessionEmail();
  if (!email) {
    return NextResponse.json(
      { error: 'Sign in to see your tickets.', code: 'not_signed_in' },
      { status: 401 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const upstream = await fetch(
      `${backendUrl()}/api/tickets/${encodeURIComponent(params.id)}/transcript`,
      { method: 'GET', headers: { 'x-ticket-owner': email }, signal: controller.signal },
    );

    if (upstream.status === 404) {
      // The backend answers 404 for a ticket that is not the caller's as well as
      // for one that does not exist, and this route passes that through as-is.
      // Collapsing it to "no such ticket" here is the same answer, which is the
      // point: a wrong guess must not be distinguishable from a real reference
      // belonging to someone else.
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
