import type { DefaultSession } from 'next-auth';

/**
 * Ambient type augmentation for next-auth v4.
 *
 * Google returns `email_verified`, and v4 keeps the raw profile on the JWT but
 * does not surface it on the session. The store maps it to
 * `SessionUser.verified`, which the header renders as an "Identity verified"
 * badge, so it is declared once here instead of cast at every read site.
 *
 * `emailVerified` is declared as required rather than optional on purpose: the
 * session callback in `lib/auth.ts` always sets it, so a consumer physically
 * cannot forget to handle `undefined`. Make it optional and every reader has to
 * re-derive that guarantee.
 *
 * `image` is left as whatever `DefaultSession` says (optional) and is
 * deliberately never read — see `sessionToUser` in `lib/store.tsx` for why.
 */
declare module 'next-auth' {
  interface Session {
    user: {
      name: string;
      email: string;
      emailVerified: boolean;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    email_verified?: boolean;
  }
}
