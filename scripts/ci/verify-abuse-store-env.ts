// SR-951 deployment gate (D186-FP): refuse to build Web production unless
// every FAIL-CLOSED abuse-guard family (today `replay`) has a usable store
// (the Upstash pair, or a complete ABUSE_GUARD_* Durable Object
// configuration). Fail-open families without a store are reported, not
// refused: they raise the runtime SR-951 alert instead. Reads the env file that
// `vercel pull --environment=production` wrote; prints family names and store
// kinds only, never a value.
//
// Vercel CLI 59.x writes a Sensitive variable whose value the API withholds
// as the literal placeholder `[SENSITIVE]` (envPullCommandLogic ->
// getRedactedSensitiveKeys). Such a key counts as present; its strength and
// shape are checked at runtime, not here (reported as presence-only).
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

export const VERCEL_SENSITIVE_PLACEHOLDER = '[SENSITIVE]';

/** Dotenv lines `KEY=value`, `KEY="value"` or `KEY='value'`; others ignored. */
export function parseEnvFile(text: string): {
  env: AbuseStoreCoverageEnv;
  redacted: Set<string>;
} {
  const env: Record<string, string> = {};
  const redacted = new Set<string>();
  for (const line of text.split(/\r?\n/u)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/u.exec(
      line
    );
    if (!match || !RELEVANT.has(match[1]!)) continue;
    let value = match[2]!.trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote))
      value = value.slice(1, -1);
    if (value === VERCEL_SENSITIVE_PLACEHOLDER) redacted.add(match[1]!);
    env[match[1]!] = value;
  }
  return { env: env as AbuseStoreCoverageEnv, redacted };
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
  const { env, redacted } = parseEnvFile(text);
  const coverage = abuseStoreCoverage(env, Date.now(), redacted);
  for (const { family, store, presenceOnly, required } of coverage)
    console.log(
      `abuse-guard family ${family}: ${store}${presenceOnly ? ' (Sensitive values: presence only)' : ''}${required ? '' : ' [fail-open]'}`
    );
  for (const { family, reason } of coverage.filter(
    (entry) => entry.store === 'none' && !entry.required
  ))
    console.log(
      `::warning::Fail-open abuse-guard family ${family} ${reason}; it raises the runtime SR-951 alert instead of enforcing.`
    );
  const uncovered = coverage.filter(
    (entry) => entry.store === 'none' && entry.required
  );
  for (const { family, reason } of uncovered)
    console.error(
      `::error::Fail-closed abuse-guard family ${family} ${reason}.`
    );
  if (uncovered.length > 0) {
    console.error(
      '::error::Refusing to build (SR-951): every fail-closed abuse-guard family needs a store on the Web production environment, either ABUSE_GUARD_URL, ABUSE_GUARD_SECRET and ABUSE_GUARD_KEY_PEPPER with the family listed in ABUSE_GUARD_FAMILIES, or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for families left on the legacy store.'
    );
    return 1;
  }
  return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
