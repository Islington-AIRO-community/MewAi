import { NextResponse } from 'next/server';
import type { SupportType } from '@/lib/types';
import { sessionEmail } from '../_session';
import {
  AI_TIMEOUT_MS,
  backendUnreachable,
  backendUrl,
  badRequest,
} from '../_shared';

/**
 * `POST /api/ai/tickets` — proxy for `POST /api/tickets` on the AI backend.
 *
 * The final write of the intake. Everything the backend rejects is echoed back
 * verbatim: its 422 names the exact missing attributes, and the review form
 * highlights those fields, so a second validation layer here would only risk
 * disagreeing with the authoritative one.
 *
 * `GET` is the other half — the signed-in reporter's own tickets. See
 * `app/api/ai/tickets/[id]/route.ts` for how ownership is enforced; the short
 * version is that it is enforced here and nowhere else, because the AI backend
 * has no authentication of any kind.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SUPPORT_TYPES = new Set<SupportType>([
  'rescue',
  'relief-supplies',
  'medical',
  'security',
]);
const URGENCIES = new Set(['critical', 'high', 'medium', 'low']);

/** Trim a field to a string, capped, treating null/undefined as absent. */
function text(value: unknown, max: number): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value).slice(0, max);
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

/** Discriminated on `ok` so the failure path narrows to a real string. */
type Validation = { ok: true; payload: Record<string, unknown> } | { ok: false; error: string };

function validate(body: unknown): Validation {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const b = body as Record<string, unknown>;

  const supportRaw = b.support_needed;
  if (!Array.isArray(supportRaw) || supportRaw.length === 0) {
    return { ok: false, error: 'At least one support type is required.' };
  }
  const support = [
    ...new Set(
      supportRaw.filter(
        (value): value is SupportType =>
          typeof value === 'string' && SUPPORT_TYPES.has(value as SupportType),
      ),
    ),
  ];
  if (support.length === 0) {
    return {
      ok: false,
      error: `\`support_needed\` must contain at least one of: ${[...SUPPORT_TYPES].join(', ')}.`,
    };
  }

  const urgency = b.urgency;
  if (typeof urgency !== 'string' || !URGENCIES.has(urgency)) {
    return { ok: false, error: '`urgency` must be one of: critical, high, medium, low.' };
  }

  return {
    ok: true,
    payload: {
      reporter_name: text(b.reporter_name, 120),
      reporter_phone: text(b.reporter_phone, 40),
      victim_name: text(b.victim_name, 120),
      victim_phone: text(b.victim_phone, 40),
      summary: text(b.summary, 4000),
      location: text(b.location, 400),
      people_affected: b.people_affected ?? null,
      support_needed: support,
      urgency,
      on_behalf_of_other: b.on_behalf_of_other === true,
      notes: text(b.notes, 2000),
      // Allowlisted rather than passed through, and narrower than the rest of
      // the body on purpose: `source` is free text the admin tooling reads, so
      // the browser must not be able to write an arbitrary string into the row.
      // SOS is the one non-conversational caller that exists.
      source: b.source === 'sos' ? 'sos' : 'ai-chat',
      session_id: text(b.session_id, 64) || 'anonymous',
      // Deliberately not read from the body: `validate` drops whatever the
      // caller sent. The value that decides ownership is the session address,
      // and it reaches the backend in the `x-ticket-owner` header set in `POST`
      // — never in this field, which the backend overwrites from that header.
      owner_email: null,
    },
  };
}

/**
 * The reporter's own tickets.
 *
 * Requires a session, and resolves the address from the httpOnly cookie. The
 * address is passed to the backend in a header it trusts, because the backend
 * cannot verify it and does not try to.
 */
export async function GET() {
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
    const upstream = await fetch(`${backendUrl()}/api/tickets/mine`, {
      method: 'GET',
      headers: { 'x-ticket-owner': email },
      signal: controller.signal,
    });
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

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  const result = validate(body);
  if (!result.ok) return badRequest(result.error);

  // The one place the ticket's owner is decided.
  //
  // A ticket is bound to an account only if the person filing it already had a
  // session, and the address is resolved from the httpOnly session cookie rather
  // than anything the caller sent — the cookie is httpOnly, so the browser cannot
  // read it and cannot assert an identity. That resolution happens here and this
  // handler is the only place the POST proxy touches it.
  //
  // It travels to the backend in the `x-ticket-owner` header, and the header is
  // load-bearing: `create_ticket` reads ownership from `_request_owner(request)`
  // and `_clean` then overwrites the body's `owner_email` with it, so a request
  // that omits the header inserts `owner_email = NULL` no matter what the body
  // says. That is what stops any direct caller of the backend from filing a
  // ticket as a victim and then reading their queue through `/api/tickets/mine`,
  // and it is the same header `GET` and `POST /api/ai/tickets/claim` already
  // send. Setting the body field alone is not a weaker version of this — it is
  // no ownership at all, which is how a signed-in reporter's ticket used to end
  // up orphaned and invisible in `/tickets`.
  //
  // A signed-out reporter gets no header, which is a supported outcome, not an
  // error. Their ticket is real and will be worked; it just has no portal, and
  // `POST /api/ai/tickets/claim` is the way back if they sign in later.
  const email = await sessionEmail();
  result.payload.owner_email = email;

  // Conditional on purpose: `Headers` coerces a `null` value to the literal
  // string "null", which is a non-empty header. `_request_owner` would accept
  // it as a real address and every anonymous ticket would be filed under an
  // account called "null" — owned by nobody in `/tickets` and unmanageable from
  // anywhere else. Omitting the key is what makes "signed out" mean signed out.
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (email) headers['x-ticket-owner'] = email;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${backendUrl()}/api/tickets`, {
      method: 'POST',
      headers,
      body: JSON.stringify(result.payload),
      signal: controller.signal,
    });
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
