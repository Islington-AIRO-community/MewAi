import { getToken } from 'next-auth/jwt';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Gate the routes that belong to a person.
 *
 * Scope is deliberately narrow, and it is worth being precise about why, because
 * the obvious next step — "gate the rest too" — would be wrong for this product.
 *
 *  - `/reports` is gated because the data behind it belongs to a person.
 *  - `/tickets` is gated for the same reason, and harder: the rows behind it
 *    are real Postgres records holding a survivor's name, phone number, the
 *    address they were trapped at, and what they told us they needed.
 *  - `/admin` is gated twice over — a session, then an `ADMIN_EMAILS`
 *    allowlist — because the queue shows every one of those rows at once.
 *  - `/`, `/resources` and the SOS flow stay open. Putting a Google round-trip
 *    in front of someone asking for help during a disaster is a real harm:
 *    outages are exactly when this app matters, the person may have no Google
 *    account, and Google's consent screen is another host that can be
 *    unreachable. The login page already promises "You can send an SOS without
 *    signing in", and this is the code that makes that true. Ticket *filing*
 *    stays open for the same reason; only looking one up afterwards needs an
 *    account.
 *  - `/chat` and `/dashboard` stay open so the intake and triage views are
 *    reachable signed out; the session only personalises the greeting and the
 *    account menu there.
 *
 * NOTE: this is a UX redirect, **not authorization**. A matcher can be routed
 * around, so the real enforcement for every route matched here is repeated in
 * its own API handler — see `app/api/ai/_session.ts`. `/reports` is the
 * exception, and only because the data behind it is mock `useState` with no
 * user scoping to enforce yet.
 */
export async function middleware(req: NextRequest) {
  const token = await getToken({
    req,
    // Read the secret directly rather than importing `authOptions`. Middleware
    // runs on the edge runtime, and `authOptions` pulls in the Google provider
    // and the Node crypto next-auth uses for signing — importing it here would
    // either fail to bundle or drag server code onto the edge.
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) return redirectToLogin(req);

  // Signed in, but `/admin` needs more than a session. Compared here for the
  // same reason as the gate above: to send the wrong person somewhere sensible
  // instead of showing them an empty queue. The API handler checks this again.
  if (req.nextUrl.pathname.startsWith('/admin') && !isAdminEmail(token.email)) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

function redirectToLogin(req: NextRequest) {
  const url = new URL('/login', req.url);
  // Preserve where they were headed, including the query string, so signing in
  // returns them to the page they asked for rather than to the dashboard.
  url.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

/**
 * Admin allowlist, read from `ADMIN_EMAILS`.
 *
 * Inlined rather than imported from `app/api/ai/_session.ts` because that
 * module imports `lib/auth.ts`, which cannot be bundled for the edge. An unset
 * or empty list matches nothing, so a deployment that forgets to configure it
 * locks `/admin` rather than opening it.
 */
function isAdminEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  const allowed = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

export const config = {
  // Scoped to these subtrees on purpose. A bare `middleware.ts` with no
  // matcher runs on every request in the app, adding latency to the landing page
  // and the SOS flow — the two places where speed matters most.
  matcher: ['/reports/:path*', '/tickets/:path*', '/admin/:path*'],
};
