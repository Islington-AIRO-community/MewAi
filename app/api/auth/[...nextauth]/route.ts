import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * The OAuth handshake. Google redirects here, this exchanges the code for a
 * token, and the session lands as an httpOnly cookie the browser cannot read.
 *
 * `runtime = 'nodejs'` and `force-dynamic` mirror the `/api/ai/*` handlers. The
 * runtime is not incidental: next-auth v4 signs and verifies JWTs with Node
 * crypto, so this cannot run on the edge the way `middleware.ts` does.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
