import { NextResponse } from 'next/server';
import { sessionEmail } from '../../_session';
import { AI_TIMEOUT_MS, backendUnreachable, backendUrl } from '../../_shared';

/**
 * `POST /api/ai/tickets/claim` — attach a ticket filed signed out to your account.
 *
 * Anonymous intake is a real, supported path: someone in a disaster can file a
 * ticket with no account at all. The problem is what it produces. A ticket with
 * no owner belongs to nobody and therefore could never be reopened — not by the
 * person who filed it, not by anyone. They got a reference code and no way to
 * use it. This route is the way back.
 *
 * Proof is the reporter's own phone number. The reference alone would not do:
 * ids are sequential, so `TKT-000001` onwards are guessable, and the phone is
 * something the caller had to know already because they typed it into the
 * ticket. The backend applies both conditions inside a single guarded UPDATE,
 * so an owned ticket can never be taken over by this route.
 *
 * The email is taken from the session cookie, never from the body — a caller can
 * only ever claim a ticket *for themselves*, and cannot claim one *for* someone
 * else the way the ownership bug allowed.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const email = await sessionEmail();
  if (!email) {
    return NextResponse.json(
      { error: 'Sign in to see your tickets.', code: 'not_signed_in' },
      { status: 401 },
    );
  }

  let ticketId = '';
  let reporterPhone = '';
  try {
    const body = (await request.json()) as { ticketId?: unknown; reporterPhone?: unknown };
    ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : '';
    reporterPhone = typeof body.reporterPhone === 'string' ? body.reporterPhone : '';
  } catch {
    return NextResponse.json(
      { error: 'Enter the ticket reference and the phone number you gave us.', code: 'invalid' },
      { status: 400 },
    );
  }

  // The backend re-validates both against the row, and answers one identical 404
  // for every failure. A 422 here would let a caller separate "malformed" from
  // "not yours", which is the distinction this endpoint exists to withhold.
  if (!ticketId || reporterPhone.trim().length < 6) {
    return NextResponse.json(
      { error: 'That reference and phone number do not match a ticket.', code: 'not_found' },
      { status: 404 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${backendUrl()}/api/tickets/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ticket-owner': email },
      body: JSON.stringify({ ticket_id: ticketId, reporter_phone: reporterPhone }),
      signal: controller.signal,
    });

    if (upstream.status === 404) {
      return NextResponse.json(
        { error: 'That reference and phone number do not match a ticket.', code: 'not_found' },
        { status: 404 },
      );
    }

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return backendUnreachable(error);
  } finally {
    clearTimeout(timer);
  }
}
