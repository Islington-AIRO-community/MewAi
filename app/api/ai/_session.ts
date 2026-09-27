import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { authOptions } from '@/lib/auth';

/**
 * Server-side session and allowlist helpers for the `/api/ai/*` proxy.
 *
 * Every one of these reads the httpOnly session cookie. Nothing here can be
 * reached from a request body, a query string, or a header the browser chose —
 * which is the only reason any of it is trustworthy. The browser cannot read
 * the cookie, so it cannot assert an identity.
 *
 * `lib/auth.ts` is imported here and *only* here. It pulls in the Google
 * provider and the Node crypto next-auth uses for signing, so it cannot be
 * imported by a client component or by `middleware.ts`, which runs on the edge.
 * Route handlers are server-side Node, so this is the correct place for it.
 */

/** The signed-in account's email, lowercased, or `null` if there is no session. */
export async function sessionEmail(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return null;
  return email.trim().toLowerCase();
}

/**
 * Accounts allowed to reach `/admin` and the admin API.
 *
 * From `ADMIN_EMAILS`, a comma-separated list of addresses. An unset or empty
 * list admits nobody, so a deployment that forgets to configure it is locked
 * rather than open. There is no role system and no `users` table behind this —
 * it is a list, and it is deliberately the smallest thing that can work.
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(email: string | null): boolean {
  if (!email) return false;
  return adminEmails().includes(email);
}

/**
 * The allowlist check for route handlers.
 *
 * This is the real access control. `middleware.ts` performs the same test, but
 * a middleware matcher is a UX redirect that a request can simply route around —
 * the enforcement has to live at the point the data is returned, or `/admin` is
 * a redirect and not a lock.
 */
export async function requireAdmin(): Promise<
  { ok: true; email: string } | { ok: false }
> {
  const email = await sessionEmail();
  if (!isAdmin(email)) return { ok: false };
  return { ok: true, email: email as string };
}

/**
 * Session lookup for `middleware.ts`, which cannot import `authOptions`.
 *
 * `getToken` needs the secret passed in explicitly, so this takes it as an
 * argument rather than reading the environment itself — the edge runtime has no
 * Node crypto, and a bare `process.env` read is fine but keeping the dependency
 * visible at the call site is clearer.
 */
export async function tokenEmail(
  req: NextRequest,
  secret: string | undefined,
): Promise<string | null> {
  const token = await getToken({ req, secret });
  const email = token?.email;
  if (typeof email !== 'string') return null;
  return email.trim().toLowerCase();
}
