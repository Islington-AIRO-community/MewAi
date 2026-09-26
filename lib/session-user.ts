import type { Session } from 'next-auth';

/**
 * Session → `SessionUser` projection.
 *
 * Split out of `lib/store.tsx` deliberately: this is a pure function over its
 * input, and keeping it in a `'use client'` module full of React and JSX makes
 * it impossible to exercise without a bundler. Here it can be run directly.
 */
export interface SessionUser {
  name: string;
  email: string;
  avatarHref: string | null;
  initials: string;
  verified: boolean;
}

/**
 * next-auth v4 has no exported `SessionStatus` type — the status is a bare
 * string union inside `SessionContextValue`. Named here so this function reads
 * as a total function over the three states rather than taking `any string`.
 */
export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

/**
 * Project a next-auth session onto the app's `SessionUser`.
 *
 * The store used to own `user` as `useState` behind a `signIn` setter the
 * client could call. That is gone: `user` is derived from the OAuth session,
 * which lives in an httpOnly cookie that JavaScript cannot read. A client-
 * writable `user` would be a second, forgeable source of truth sitting next to
 * the real one.
 *
 * Returns `null` unless the session is fully resolved *and* carries an email.
 * Those are two distinct states — unauthenticated and still-loading — and they
 * collapse to `null` on purpose, because most callers genuinely do not care.
 * The one that does is the header, which must not flash a "Sign in" button
 * before the cookie has been read; it reads `useSession().status` directly.
 */
export function sessionToUser(
  session: Session | null | undefined,
  status: SessionStatus,
): SessionUser | null {
  if (status !== 'authenticated') return null;
  const email = session?.user?.email;
  if (!email) return null;

  return {
    // Google always returns a name for a real account, but an empty or
    // whitespace-only one should degrade to the local part of the address
    // rather than rendering a blank greeting in the header.
    name: session?.user?.name?.trim() || email.split('@')[0] || 'Reporter',
    email,
    // Google's `picture` is a real URL on a Google CDN, and it is dropped on
    // purpose. This app renders no images anywhere — avatars are inline SVG and
    // every icon is a bundled component — so following it would add an
    // external request to the header on every page load and contradict a
    // documented performance invariant for a purely cosmetic gain. `Avatar`
    // falls back to initials, which is what demo users already looked like.
    avatarHref: null,
    // Left empty for the same reason: `Avatar` derives its own initials from
    // `name`, nothing reads this field, and a second copy would be another
    // thing to keep in sync.
    initials: '',
    // From Google's `email_verified`, surfaced by the session callback in
    // `lib/auth.ts`. Never hardcoded true — an unverified Google account is a
    // real state and must not be laundered into a trusted-looking badge.
    verified: session?.user?.emailVerified === true,
  };
}
