import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE_NAME, verifyAdminToken } from './lib/admin-session';

/**
 * Single gate: /admin/* (except /admin/login) requires a valid
 * cd_admin signed cookie. Everything else — visitor chat, embed
 * widget, tool webhooks, marketing landing — is fully open.
 *
 * No Clerk: customerdog dropped Clerk in commit 3 of the rewrite.
 * Visitors are anonymous (cookie-only); admins use the single shared
 * ADMIN_PASSWORD env var.
 */
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (!path.startsWith('/admin') || path.startsWith('/admin/login')) {
    return NextResponse.next();
  }

  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const secret = process.env.ADMIN_COOKIE_SECRET;
  if (!secret || !(await verifyAdminToken(secret, token))) {
    const url = req.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Run only on /admin/* — visitor chat, embed, widget.js, tool
  // webhooks all bypass middleware entirely.
  matcher: ['/admin/:path*'],
};
