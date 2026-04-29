#!/usr/bin/env -S node --env-file=.env.local --import tsx
/**
 * One-shot bootstrap: register the customerdog tools with qlaud and
 * print the per-tool HMAC secrets to stdout so you can paste them
 * into your env.
 *
 * Usage (run from your local checkout, with .env.local pointing at
 * your production env so the webhook URLs match the deployed app):
 *   npm run register-tools
 *
 * Idempotency:
 *   qlaud rejects duplicate tool names with HTTP 409. Re-running
 *   after a successful registration prints a clear note per
 *   already-registered tool and exits non-zero. To rotate a tool's
 *   secret, DELETE it first:
 *     curl -X DELETE -H "x-api-key: $QLAUD_KEY" \
 *          https://api.qlaud.ai/v1/tools/<id>
 *
 * Self-contained by design: this script is the only thing the operator
 * runs locally before the first deploy, so it must not depend on the
 * server-only Next.js modules (importing src/lib/qlaud here would pull
 * in `server-only` and throw before our env checks even run).
 */

import { toolDefs } from '../src/lib/tools/definitions';

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';

function die(msg: string): never {
  console.error(`${RED}✗${RESET} ${msg}`);
  process.exit(1);
}

// ─── Pre-flight env checks ─────────────────────────────────────────────

const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
if (!baseUrl) {
  die(
    'NEXT_PUBLIC_APP_URL is not set.\n' +
      '  Set it to the URL where your customerdog deploy is reachable, e.g.:\n' +
      `    ${DIM}NEXT_PUBLIC_APP_URL=https://your-deploy.vercel.app npm run register-tools${RESET}`,
  );
}

const qlaudKey = process.env.QLAUD_KEY;
if (!qlaudKey) {
  die(
    'QLAUD_KEY is not set.\n' +
      '  Mint one at https://qlaud.ai/keys (admin scope is required\n' +
      '  to register tools), then add it to your env:\n' +
      `    ${DIM}QLAUD_KEY=qlk_live_…${RESET}`,
  );
}
if (!qlaudKey.startsWith('qlk_live_') && !qlaudKey.startsWith('qlk_test_')) {
  die(
    `QLAUD_KEY doesn't look like a qlaud key (expected ${DIM}qlk_live_…${RESET} ` +
      `or ${DIM}qlk_test_…${RESET}, got "${qlaudKey.slice(0, 12)}…").`,
  );
}

const qlaudBase =
  process.env.QLAUD_BASE_URL ?? 'https://api.qlaud.ai';

const defs = toolDefs(baseUrl);
if (defs.length === 0) {
  console.log(
    `${YELLOW}No tools defined in src/lib/tools/definitions.ts — nothing to register.${RESET}`,
  );
  process.exit(0);
}

console.log(
  `${DIM}Registering ${defs.length} tool(s) with qlaud at ${qlaudBase}…${RESET}\n`,
);

// ─── Inline registration call (no src/lib/qlaud import) ────────────────

type ToolDef = ReturnType<typeof toolDefs>[number];
type RegisterResult = ToolDef & { id: string; secret: string };

class QlaudFail extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function registerTool(def: ToolDef): Promise<RegisterResult> {
  const r = await fetch(`${qlaudBase}/v1/tools`, {
    method: 'POST',
    headers: {
      'x-api-key': qlaudKey!,
      'content-type': 'application/json',
    },
    body: JSON.stringify(def),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new QlaudFail(r.status, text.slice(0, 500));
  }
  return (await r.json()) as RegisterResult;
}

// ─── Register ───────────────────────────────────────────────────────────

(async () => {
  const out: Array<{ envName: string; secret: string; id: string }> = [];

  for (const def of defs) {
    try {
      const r = await registerTool(def);
      out.push({
        envName: `QLAUD_TOOL_SECRET_${def.name.toUpperCase()}`,
        secret: r.secret,
        id: r.id,
      });
      console.log(`  ${GREEN}✓${RESET} ${def.name.padEnd(22)} ${DIM}→ ${r.id}${RESET}`);
    } catch (e) {
      if (e instanceof QlaudFail) {
        if (e.status === 401) {
          die(
            `QLAUD_KEY was rejected (401). The key is invalid, revoked, or expired.\n` +
              `  Mint a fresh one at https://qlaud.ai/keys.`,
          );
        }
        if (e.status === 403) {
          die(
            `QLAUD_KEY is missing admin scope (403). Tool registration requires\n` +
              `  admin scope. Mint a new key at https://qlaud.ai/keys with\n` +
              `  scope=admin and update QLAUD_KEY.`,
          );
        }
        if (e.status === 409) {
          console.log(
            `  ${YELLOW}!${RESET} ${def.name.padEnd(22)} ${DIM}already registered (409). To rotate the secret, DELETE the old tool first.${RESET}`,
          );
          process.exitCode = 1;
          continue;
        }
        die(`qlaud /v1/tools returned ${e.status}: ${e.message}`);
      }
      die(`unexpected error registering ${def.name}: ${(e as Error).message}`);
    }
  }

  if (out.length === 0) {
    console.log(
      `\n${YELLOW}Nothing newly registered.${RESET} If you meant to rotate, ` +
        `DELETE the existing tools first.`,
    );
    return;
  }

  console.log(
    `\n${GREEN}Done.${RESET} Add these to your env (Vercel → Settings → ` +
      `Environment Variables, then redeploy):\n`,
  );
  for (const { envName, secret } of out) {
    console.log(`${envName}=${secret}`);
  }
})().catch((e) => {
  die(`unexpected error: ${(e as Error).message}`);
});
