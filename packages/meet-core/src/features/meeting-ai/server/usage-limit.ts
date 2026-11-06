import 'server-only';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  checkMeetAiUsage,
  type MeetAiUsageInput,
} from '@tuturuuu/ai/meetings/usage-limit';
import type { AbuseGuardBinding } from '@tuturuuu/utils/abuse-guard/client';
import {
  type AbuseGuardEnv,
  configureAbuseGuardRuntime,
  selectAbuseGuard,
} from '@tuturuuu/utils/abuse-guard/select';
import { MeetAiError } from './access';

const GUARD_ENV_KEYS = [
  'ABUSE_GUARD_BACKEND',
  'ABUSE_GUARD_URL',
  'ABUSE_GUARD_SECRET',
  'ABUSE_GUARD_KEY_PEPPER',
  'ABUSE_GUARD_FAMILIES',
  'ABUSE_GUARD_TIMEOUT_MS',
] as const;

type WorkerEnv = Record<string, unknown>;

async function workerEnv(): Promise<WorkerEnv | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env as unknown as WorkerEnv;
  } catch {
    return null;
  }
}

function text(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

/** Worker vars win over ambient process env, key by key. */
function mergedEnv(env: WorkerEnv | null): Record<string, string | undefined> {
  const ambient =
    typeof process === 'undefined'
      ? {}
      : (process.env as Record<string, string | undefined>);
  if (!env) return ambient;
  const merged: Record<string, string | undefined> = { ...ambient };
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') merged[key] = value;
  }
  return merged;
}

function isBinding(value: unknown): value is AbuseGuardBinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { run?: unknown }).run === 'function'
  );
}

/**
 * The `meet` family store for this Worker (Meet or Parley). A bound
 * `ABUSE_GUARD` service is injected into the shared runtime selection;
 * otherwise only a complete signed-HTTPS configuration is usable. Anything
 * else selects `legacy`/`off`, which the limiter refuses (fail closed).
 */
export async function meetAiUsageGuard() {
  const env = await workerEnv();
  const merged = mergedEnv(env);
  const binding = env?.ABUSE_GUARD;
  if (isBinding(binding)) {
    configureAbuseGuardRuntime({
      binding,
      pepper: text(env?.ABUSE_GUARD_KEY_PEPPER),
      families: text(env?.ABUSE_GUARD_FAMILIES),
      timeoutMs: text(env?.ABUSE_GUARD_TIMEOUT_MS),
    });
  }
  const guardEnv: AbuseGuardEnv = {};
  for (const key of GUARD_ENV_KEYS) guardEnv[key] = merged[key];
  return { selection: selectAbuseGuard('meet', guardEnv), env: merged };
}

/**
 * Charges one paid Meet AI admission or throws: 429 when a limit is reached,
 * 503 when the limiter cannot decide. Call before any chunk row, credit
 * check or provider call.
 */
export async function enforceMeetAiUsage(input: MeetAiUsageInput) {
  let decision: Awaited<ReturnType<typeof checkMeetAiUsage>>;
  try {
    const { selection, env } = await meetAiUsageGuard();
    decision = await checkMeetAiUsage(input, { selection, env });
  } catch {
    decision = await checkMeetAiUsage(input, { selection: { kind: 'off' } });
  }
  if (decision.ok) return;
  throw new MeetAiError(
    decision.status,
    decision.status === 429
      ? 'Meeting AI usage limit reached; try again later'
      : 'Meeting AI usage limiter is unavailable',
    decision.code,
    decision.retryAfterSeconds
  );
}
