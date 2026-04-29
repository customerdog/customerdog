import { signInAdmin } from './actions';
import { SetupScreen } from '@/components/setup-screen';
import { getMissingRequiredEnv } from '@/lib/setup-check';

export const metadata = {
  title: 'Sign in — customerdog admin',
};

const ERROR_COPY: Record<string, string> = {
  invalid: 'Wrong password.',
  'server-misconfigured':
    'Server misconfigured: ADMIN_PASSWORD or ADMIN_COOKIE_SECRET is unset. Check your env vars.',
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // If the deploy isn't finished, the operator IS the admin — show
  // them what to fix instead of a "wrong password" loop they can't
  // escape (since the password isn't set, no input would work).
  const missing = getMissingRequiredEnv();
  if (missing.length > 0) {
    return <SetupScreen missing={missing} />;
  }

  const { error } = await searchParams;
  const errorCopy = error ? ERROR_COPY[error] : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Admin sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter the password your operator set in <code className="rounded bg-muted px-1 py-0.5 text-xs">ADMIN_PASSWORD</code>.
      </p>

      <form action={signInAdmin} className="mt-8 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Password
          <input
            type="password"
            name="password"
            autoFocus
            required
            className="rounded-md border border-border bg-background px-3 py-2 text-sm font-normal outline-none focus:border-primary/50"
          />
        </label>

        {errorCopy ? (
          <p className="text-sm text-red-600">{errorCopy}</p>
        ) : null}

        <button
          type="submit"
          className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Sign in
        </button>
      </form>

      <p className="mt-6 text-xs text-muted-foreground">
        No password yet? Set <code>ADMIN_PASSWORD</code> and{' '}
        <code>ADMIN_COOKIE_SECRET</code> in your env, then redeploy.
      </p>
    </main>
  );
}
