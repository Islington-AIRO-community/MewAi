import { NextResponse } from 'next/server';
import { sessionEmail } from '../../../_session';
import {
  AI_TIMEOUT_MS,
  backendUnreachable,
  backendUrl,
  badRequest,
} from '../../../_shared';

/**
 * `/api/ai/tickets/[id]/messages` — the follow-up conversation on one ticket.
 *
 * `GET` returns the ticket and its history together; `POST` adds a message and
 * returns the assistant's answer. Both resolve the caller's address from the
 * session cookie and forward it in `x-ticket-owner`, which the backend checks
 * against the ticket before answering. A ticket the caller does not own comes
 * back 404 from the backend and 404 from here.
 *
 * There is no path through this file that forwards a ticket id without also
 * forwarding an address the client could not have chosen. That is the invariant
 * worth preserving in any edit below: a bare `GET /{id}` proxy would reintroduce
 * the enumeration hole the backend's own unauthenticated endpoint has always
 * had.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_MESSAGE_CHARS = 2000;

/**
 * The caller's address, or the 401 to send instead.
 *
 * Typed as `Response` rather than `NextResponse` on purpose: `NextResponse`'s
 * body generic appears in both variance positions, so a
 * `NextResponse<{error, code}>` is not assignable to a bare `NextResponse` and
 * the union would not typecheck. `NextResponse` is a `Response`, so this widens
 * without loosening anything the handlers return.
 */
async function owner(): Promise<string | Response> {
  const email = await sessionEmail();
  if (email) return email;
  return NextResponse.json(
    { error: 'Sign in to see your tickets.', code: 'not_signed_in' },
    { status: 401 },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const email = await owner();
  if (typeof email !== 'string') return email;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
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

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const email = await owner();
  if (typeof email !== 'string') return email;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  const message =
    typeof (body as { message?: unknown } | null)?.message === 'string'
      ? ((body as { message: string }).message.trim() ?? '')
      : '';
  if (!message) return badRequest('A message is required.');
  if (message.length > MAX_MESSAGE_CHARS) {
    return badRequest(`A message must be ${MAX_MESSAGE_CHARS} characters or fewer.`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const upstream = await fetch(
      `${backendUrl()}/api/tickets/${encodeURIComponent(params.id)}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ticket-owner': email,
        },
        body: JSON.stringify({ message }),
        signal: controller.signal,
      },
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
