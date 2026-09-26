import { getToken } from 'next-auth/jwt';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Gate the one genuinely personal route.
 *
 * Scope is deliberately narrow, and it is worth being precise about why, because
 * the obvious next step — "gate the rest too" — would be wrong for this product.
 *
 *  - `/reports` is gated because the data behind it belongs to a person.
 *  - `/`, `/resources` and the SOS flow stay open. Putting a Google round-trip
 *    in front of someone asking for help during a disaster is a real harm:
 *    outages are exactly when this app matters, the person may have no Google
 *    account, and Google's consent screen is another host that can be
 *    unreachable. The login page already promises "You can send an SOS without
 *    signing in", and this is the code that makes that true.
 *  - `/chat` and `/dashboard` stay open so the intake and triage views are
 *    reachable signed out; the session only personalises the greeting and the
 *    account menu there.
 *
 * NOTE: this is a UX redirect, **not authorization**. The reports behind it are
 * mock data held in `useState` — there is no user-scoped data to protect, and
 * `lib/store.tsx` still resets on refresh even while signed in. This becomes a
 * genuine access control when the deferred `users` table lands; until then,
 * nothing here should be described as securing anything.
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

  if (token) return NextResponse.next();

  const url = new URL('/login', req.url);
  // Preserve where they were headed, including the query string, so signing in
  // returns them to the page they asked for rather than to the dashboard.
  url.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Scoped to this one subtree on purpose. A bare `middleware.ts` with no
  // matcher runs on every request in the app, adding latency to the landing page
  // and the SOS flow — the two places where speed matters most.
  matcher: ['/reports/:path*'],
};
