import { ChatShell } from '@/components/chat/chat-shell';
import { SetupScreen } from '@/components/setup-screen';
import { getConfig } from '@/lib/supabase';
import { getMissingRequiredEnv } from '@/lib/setup-check';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Chat — customerdog',
};

/**
 * Full-page chat for visitors. The thread/visitor cookies are managed
 * server-side on the first POST to /api/chat — this page renders blank
 * and lets the user type their first message.
 *
 * For embedding in a host page, use /embed (no header chrome) instead.
 */
export default async function ChatPage() {
  const missing = getMissingRequiredEnv();
  if (missing.length > 0) {
    return <SetupScreen missing={missing} />;
  }

  let companyName = 'Support';
  let brandColor: string | undefined;
  try {
    const cfg = await getConfig();
    companyName = cfg.company_name;
    brandColor = cfg.brand_color;
  } catch {
    // Supabase reachable but query failed — render generic shell.
  }

  return <ChatShell companyName={companyName} brandColor={brandColor} mode="page" />;
}
