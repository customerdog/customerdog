import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getQlaudState } from '@/lib/user-state';
import { qlaud } from '@/lib/qlaud';

export const dynamic = 'force-dynamic';

// /chat (no thread id) — picks the most recent thread for this user, or
// creates a fresh one. Then redirects to /chat/[id]. Keeps the URL stable
// for back-button navigation while the user only ever sees one chat at a
// time.
export default async function ChatRootPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const state = await getQlaudState(userId);
  if (!state) {
    // Webhook hasn't fired yet (user just signed up but Clerk hasn't
    // delivered user.created). Show a holding screen with a retry hint.
    return <OnboardingPending />;
  }

  const list = await qlaud.listThreads({
    apiKey: state.qlaud_secret,
    endUserId: userId,
    limit: 1,
  });

  const latest = list.data[0];
  if (latest) {
    redirect(`/chat/${latest.id}`);
  }

  // No threads at all (newly seeded users have an initial one — but if
  // someone deleted them all, fall back to creating a new one).
  const fresh = await qlaud.createThread({
    apiKey: state.qlaud_secret,
    endUserId: userId,
  });
  redirect(`/chat/${fresh.id}`);
}

function OnboardingPending() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold">Setting up your account…</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Provisioning your qlaud key + first conversation. This usually
          takes a couple of seconds.
        </p>
        <a
          href="/chat"
          className="mt-4 inline-block text-sm text-primary hover:underline"
        >
          Refresh
        </a>
      </div>
    </div>
  );
}
