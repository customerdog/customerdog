import { ChatShell } from '@/components/chat/chat-shell';
import { SetupScreen } from '@/components/setup-screen';
import { getConfig } from '@/lib/supabase';
import { getMissingRequiredEnv } from '@/lib/setup-check';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Chat',
  // The embed iframe shouldn't be indexed.
  robots: { index: false, follow: false },
};

/**
 * Iframe-only chat surface used by the widget.js bootstrap on host
 * sites. Same chat component as /chat but stripped of header chrome
 * and shows a close button that postMessages the parent.
 */
export default async function EmbedPage() {
  const missing = getMissingRequiredEnv();
  if (missing.length > 0) {
    return <SetupScreen missing={missing} mode="embed" />;
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

  return (
    <ChatShell companyName={companyName} brandColor={brandColor} mode="embed" />
  );
}
