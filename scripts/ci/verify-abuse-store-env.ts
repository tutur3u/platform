// SR-951 deployment gate: refuse to build Web production unless every
// abuse-guard family has a usable store (the Upstash pair, or a complete
// ABUSE_GUARD_* Durable Object configuration). Reads the env file that
// `vercel pull --environment=production` wrote; prints family names and store
// kinds only, never a value.
// Usage: bun run scripts/ci/verify-abuse-store-env.ts <env-file>
import { readFileSync } from 'node:fs';
import {
  type AbuseStoreCoverageEnv,
  abuseStoreCoverage,
} from '../../packages/utils/src/abuse-guard/store-coverage';

const RELEVANT = new Set([
  'ABUSE_GUARD_BACKEND',
  'ABUSE_GUARD_FAMILIES',
  'ABUSE_GUARD_KEY_PEPPER',
  'ABUSE_GUARD_REPLAY_LEGACY_UNTIL',
  'ABUSE_GUARD_SECRET',
  'ABUSE_GUARD_TIMEOUT_MS',
  'ABUSE_GUARD_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'UPSTASH_REDIS_REST_URL',
]);

/** Dotenv lines `KEY=value`, `KEY="value"` or `KEY='value'`; others ignored. */
export function parseEnvFile(text: string): AbuseStoreCoverageEnv {
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/u)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/u.exec(
      line
    );
    if (!match || !RELEVANT.has(match[1]!)) continue;
    let value = match[2]!.trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote))
      value = value.slice(1, -1);
    env[match[1]!] = value;
  }
  return env as AbuseStoreCoverageEnv;
}

function main(argv: string[]) {
  const [file] = argv;
  if (!file) {
    console.error('usage: verify-abuse-store-env.ts <env-file>');
    return 2;
  }
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    console.error('::error::The pulled production env file is missing.');
    return 1;
  }
  const coverage = abuseStoreCoverage(parseEnvFile(text));
  for (const { family, store } of coverage)
    console.log(`abuse-guard family ${family}: ${store}`);
  const uncovered = coverage.filter((entry) => entry.store === 'none');
  for (const { family, reason } of uncovered)
    console.error(`::error::Abuse-guard family ${family} ${reason}.`);
  if (uncovered.length > 0) {
    console.error(
      '::error::Refusing to build: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (the same database as before), or a complete ABUSE_GUARD_* configuration, on the Web production environment (SR-951).'
    );
    return 1;
  }
  return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
