#!/usr/bin/env -S node --env-file=.env.local --import tsx
/**
 * One-shot bootstrap: register the 3 demo tools with qlaud and print
 * the per-tool secrets to stdout so you can paste them into .env.
 *
 * Usage:
 *   pnpm run register-tools
 *
 * Idempotency:
 *   qlaud rejects duplicate tool names with HTTP 409. If you re-run after
 *   a successful registration the script prints a clear message and
 *   exits non-zero — to rotate secrets you must DELETE the old tool first
 *   (curl -X DELETE …/v1/tools/<id>).
 */

import { qlaud, QlaudError } from '../src/lib/qlaud';
import { toolDefs } from '../src/lib/tools/definitions';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
if (!baseUrl) {
  console.error('NEXT_PUBLIC_APP_URL not set — set it to your deploy URL first.');
  process.exit(1);
}

const defs = toolDefs(baseUrl);

(async () => {
  const out: Array<{ envName: string; secret: string; id: string }> = [];
  for (const def of defs) {
    try {
      const r = await qlaud.registerTool(def);
      const envName = `QLAUD_TOOL_SECRET_${def.name.toUpperCase()}`;
      out.push({ envName, secret: r.secret, id: r.id });
      console.log(`✓ registered ${def.name} → ${r.id}`);
    } catch (e) {
      if (e instanceof QlaudError && e.status === 409) {
        console.error(
          `× ${def.name} already exists. To rotate, DELETE the old tool first.`,
        );
        process.exitCode = 1;
        continue;
      }
      throw e;
    }
  }

  if (out.length > 0) {
    console.log('\n# Add these to .env.local (or your hosting env):');
    for (const { envName, secret } of out) {
      console.log(`${envName}=${secret}`);
    }
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
