import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

/**
 * next-auth configuration. **Server-side only.**
 *
 * Do not import this from a client component. It reads the Google client secret,
 * and even though the secret itself is not serialised into the browser, pulling
 * `next-auth/providers/google` across the client boundary ships the provider
 * module for nothing. Client code should use `next-auth/react` (`useSession`,
 * `signIn`, `signOut`) and the `user` the store derives from it.
 *
 * The browser never learns the client ID or secret: the whole OAuth handshake
 * happens in `/api/auth/[...nextauth]`. This is the same rule as
 * `AI_API_URL` in `app/api/ai/_shared.ts` — a `NEXT_PUBLIC_` prefix here would
 * invite someone to "fix" a connection problem by making the credentials
 * public.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      // Read as empty strings rather than throwing at import time. A missing
      // secret must fail loudly when someone *tries to sign in*, not crash the
      // whole build — an unconfigured local checkout should still render pages.
      // `MissingSecret` / an invalid-client error from Google is the real signal.
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
  ],

  /**
   * JWT sessions, not database sessions.
   *
   * There is deliberately no users table yet — persistence was deferred along
   * with the admin queue, because the access model belongs to that work, not to
   * login. A JWT means the cookie carries the identity and nothing has to be
   * looked up, so this change adds no schema and no migration.
   *
   * Switching to `database` later means adding an adapter and a `users` table.
   * It does not mean rewriting this file.
   */
  session: { strategy: 'jwt' },

  pages: {
    // Keeps NextAuth from rendering its own unstyled sign-in page, which would
    // be a second, differently-branded login route in an accessibility-critical
    // app. The app's own `/login` is the only one.
    signIn: '/login',
  },

  callbacks: {
    /**
     * Copy Google's `email_verified` onto the session.
     *
     * v4 does not do this for you: the raw profile stays on the token and the
     * session gets only name/email/image. `SessionUser.verified` is what the
     * header shows as "Identity verified", so it has to come from the provider
     * rather than being hardcoded to `true` — an unverified Google account is a
     * real state and must not be laundered into a trusted-looking badge.
     */
    session({ session, token }) {
      if (session.user) {
        session.user.emailVerified = token.email_verified === true;
      }
      return session;
    },
  },
};
