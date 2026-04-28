'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  ADMIN_COOKIE_MAX_AGE_S,
  ADMIN_COOKIE_NAME,
  passwordsEqual,
  signAdminToken,
} from '@/lib/admin-session';

/** Server action invoked by the /admin/login form. Verifies the password
 *  against ADMIN_PASSWORD env, sets the signed cookie, redirects. */
export async function signInAdmin(formData: FormData): Promise<void> {
  const submitted = String(formData.get('password') ?? '');
  const expected = process.env.ADMIN_PASSWORD;
  const cookieSecret = process.env.ADMIN_COOKIE_SECRET;

  if (!expected || !cookieSecret) {
    // Misconfigured server. Surface a clear error rather than a generic
    // "wrong password" — the operator can fix env immediately.
    redirect('/admin/login?error=server-misconfigured');
  }

  // Password check first (fast path for misses).
  if (!submitted || !(await passwordsEqual(submitted, expected))) {
    redirect('/admin/login?error=invalid');
  }

  const token = await signAdminToken(cookieSecret);
  const jar = await cookies();
  jar.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_COOKIE_MAX_AGE_S,
  });

  redirect('/admin');
}

/** Server action invoked by the "Sign out" button anywhere in /admin. */
export async function signOutAdmin(): Promise<void> {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE_NAME);
  redirect('/admin/login');
}
