import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getUserRowOrNull } from '@/lib/supabase/server';
import { qlaud } from '@/lib/qlaud';
import { ChatShell } from '@/components/chat/chat-shell';

export const dynamic = 'force-dynamic';

// /chat/[threadId] — server-rendered shell with prior history baked in.
// The streaming response for new turns is handled client-side; this page
// is only responsible for the first paint.
export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  const user = await getUserRowOrNull(userId);
  if (!user) redirect('/chat');

  const { threadId } = await params;

  const [history, threadList] = await Promise.all([
    qlaud.listThreadMessages({
      apiKey: user.qlaud_secret,
      threadId,
      limit: 200,
    }),
    qlaud.listThreads({
      apiKey: user.qlaud_secret,
      endUserId: userId,
      limit: 50,
    }),
  ]);

  return (
    <ChatShell
      threadId={threadId}
      initialMessages={history.data}
      threads={threadList.data}
    />
  );
}
