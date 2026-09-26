import { NextResponse } from 'next/server';
import { sessionEmail } from '../../_session';
import { AI_TIMEOUT_MS, backendUnreachable, backendUrl } from '../../_shared';

/**
 * `GET /api/ai/tickets/[id]` — one ticket, if the signed-in reporter filed it.
 *
 * This route exists to enforce ownership, and that is its whole job. The AI
 * backend's `GET /api/tickets/{id}` has no authentication whatsoever and
 * answers for any id it is given — including `TKT-000001`, `TKT-000002`, and
 * every id after them, which is a sequential counter. Proxying it unscoped
 * would publish a directory of disaster survivors' names, phone numbers and
 * addresses to anyone who signed in.
 *
 * So the address is resolved from the session cookie here, checked against the
 * ticket's owner by the backend, and the response is 404 either way when the
 * caller does not own the ticket — see `_owns` in the backend, which returns 404
 * rather than 403 precisely so a wrong guess cannot be distinguished from an id
 * that does not exist.
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
    // Deliberately NOT the backend's bare `GET /{id}`. That endpoint is
    // unauthenticated and would return any ticket. It is the messages route
    // below that performs the ownership check and returns the ticket alongside
    // its conversation, and it 404s on a ticket the caller does not own.
    const upstream = await fetch(
      `${backendUrl()}/api/tickets/${encodeURIComponent(params.id)}/messages`,
      { method: 'GET', headers: { 'x-ticket-owner': email }, signal: controller.signal },
    );

    if (upstream.status === 404) {
      return NextResponse.json(
        { error: 'No such ticket.', code: 'not_found' },
        { status: 404 },
      );
    }

    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return backendUnreachable(error);
  } finally {
    clearTimeout(timer);
  }
}
