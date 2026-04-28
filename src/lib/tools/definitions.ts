import type { ToolDefinition } from '@/lib/qlaud';

/**
 * Source of truth for the tools registered with qlaud. Used by:
 *   - scripts/register-tools.ts (one-shot bootstrap, run after deploy)
 *   - the matching webhook handlers under src/app/api/tools/<slug>/
 *
 * Commit 4 of the rewrite adds the actual tool definitions
 * (create_ticket + send_email_to_user). For commit 3 (anonymous chat
 * scaffolding) the list is intentionally empty so the chat handler
 * runs in toolless mode.
 *
 * To add a new tool: add an entry here, drop a route under
 * src/app/api/tools/<slug>/route.ts, set QLAUD_TOOL_SECRET_<NAME> in
 * env, then re-run `npm run register-tools`.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function toolDefs(baseUrl: string): ToolDefinition[] {
  return [];
}
