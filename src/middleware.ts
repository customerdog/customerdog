import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE_NAME, verifyAdminToken } from './lib/admin-session';

/**
 * Two independent gates run in sequence:
 *
 *   1. /admin/* — signed-cookie gate (lib/admin-session.ts). Single
 *      ADMIN_PASSWORD env var; no Clerk involved.
 *   2. Everything not in the public list — Clerk session.
 *
 * Routes touched by NEITHER gate:
 *   - /                    (visitor landing)
 *   - /api/webhooks/*      (HMAC-verified per-route)
 *   - /api/tools/*         (qlaud HMAC-signed)
 *   - /admin/login         (the gate's own escape hatch)
 *
 * NOTE: chat routes (/chat/*, /api/chat, /api/threads, /api/search)
 * still pass through the Clerk gate today. Commit 3 of the rewrite
 * removes Clerk entirely and switches chat to anonymous cookies.
 */

const isAdminPath = createRouteMatcher(['/admin(.*)']);
const isAdminLogin = createRouteMatcher(['/admin/login(.*)']);

const isPublic = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks/(.*)',
  '/api/tools/(.*)',
  '/admin(.*)', // /admin/* is handled by the dedicated admin gate above
]);

export default clerkMiddleware(async (auth, req: NextRequest) => {
  // ─── Admin gate ──────────────────────────────────────────────────────
  if (isAdminPath(req) && !isAdminLogin(req)) {
    const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
    const secret = process.env.ADMIN_COOKIE_SECRET;
    if (!secret || !(await verifyAdminToken(secret, token))) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return; // admin authed; skip Clerk
  }

  // ─── Clerk gate ──────────────────────────────────────────────────────
  if (!isPublic(req)) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next internals + static files; run on everything else.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
