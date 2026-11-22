import type { ProcessorContext, ProcessorResult } from '../types';
import {
  checkMobileIssuesFence,
  type IssueCounts,
  MobileIssuesStopped,
  queryMobileIssues,
  SOURCE_LAG_MS,
} from './bigquery';

export const MOBILE_ISSUES_JOB = 'mobile-crashlytics-alerts';
const MAX_BATCH = 20;
const MAX_ACTIVE_MS = 7 * 86_400_000;
const TEST_RECEIPT = 'mobile-issues-test-sent-v1';
const ENCODER = new TextEncoder();

export function mobileIssueMode(
  mode: string | undefined,
  until: string | undefined,
  now: number
) {
  if (
    (mode !== 'active' && mode !== 'test') ||
    !until ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(until)
  )
    return 'off';
  const remaining = Date.parse(until) - now;
  const limit = mode === 'test' ? 60 * 60_000 : MAX_ACTIVE_MS;
  return remaining > 0 && remaining <= limit ? mode : 'off';
}

export function classifyMobileIssues(
  rows: IssueCounts[],
  slot: number,
  fixes: ReadonlyMap<string, number>
) {
  return rows.flatMap(
    ({ platform, issueId, build, recent, previous, firstAt }) => {
      const facts = { platform, issueId, build, count: recent };
      const fixBuild = fixes.get(`${platform}:${issueId}`);
      const spike = recent >= 10 && recent * 5 >= 3 * Math.max(previous, 1);
      return [
        ...(spike ? [{ ...facts, kind: 'spike' as const }] : []),
        ...(fixBuild !== undefined && build >= fixBuild
          ? [{ ...facts, kind: 'regression' as const, fixBuild }]
          : firstAt >= slot - 30 * 60_000 && firstAt < slot
            ? [{ ...facts, kind: 'new' as const }]
            : []),
      ];
    }
  );
}

function fixBuilds(raw: string | undefined) {
  const fixes: unknown = JSON.parse(raw ?? '{}');
  if (!fixes || typeof fixes !== 'object' || Array.isArray(fixes))
    throw new Error('fix_config');
  const entries = Object.entries(fixes);
  if (entries.length > 100) throw new Error('fix_config');
  const result = new Map<string, number>();
  for (const [key, value] of entries) {
    if (
      !/^(ios|android):[a-f0-9]{32}$/u.test(key) ||
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > 2147483647
    )
      throw new Error('fix_config');
    result.set(key, value);
  }
  return result;
}

async function publish(
  context: ProcessorContext,
  slot: string,
  alerts: object[]
) {
  const body = JSON.stringify({ slot, alerts });
  const timestamp = String(Math.floor(context.now() / 1000));
  const key = await crypto.subtle.importKey(
    'raw',
    ENCODER.encode(context.target.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const bytes = await crypto.subtle.sign(
    'HMAC',
    key,
    ENCODER.encode(`${timestamp}.PUT ${context.target.url.pathname}\n${body}`)
  );
  const signature = Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  await checkMobileIssuesFence(context);
  const response = await context.fetch(context.target.url, {
    method: 'PUT',
    redirect: 'manual',
    signal: context.signal,
    body,
    headers: {
      'content-type': 'application/json',
      'user-agent': context.userAgent,
      'x-mm-timestamp': timestamp,
      'x-mm-signature': signature,
    },
  });
  await response.body?.cancel();
  return response.ok && String(response.type) !== 'opaqueredirect';
}

export async function collectMobileIssues(
  context: ProcessorContext
): Promise<ProcessorResult> {
  const slot = context.slot;
  const mode = mobileIssueMode(
    context.env.MOBILE_CRASHLYTICS_MODE,
    context.env.MOBILE_CRASHLYTICS_UNTIL,
    context.now()
  );
  const credentials = context.env.MOBILE_CRASHLYTICS_BIGQUERY;
  if (!slot || (mode !== 'test' && (mode !== 'active' || !credentials)))
    return { outcome: 'failed', detail: { configuration: 1 } };
  try {
    if (
      mode === 'test' &&
      (await context.pending.list()).includes(TEST_RECEIPT)
    )
      return { outcome: 'ok', detail: { testAlreadySent: 1 } };
    const fixes = fixBuilds(context.env.MOBILE_CRASHLYTICS_FIX_BUILDS);
    const candidates =
      mode === 'test'
        ? [
            {
              kind: 'test',
              platform: 'ios',
              issueId: '00000000000000000000000000000000',
              build: 1,
              count: 1,
            },
          ]
        : classifyMobileIssues(
            await queryMobileIssues(context, slot, credentials ?? '', fixes),
            Date.parse(slot) - SOURCE_LAG_MS,
            fixes
          );
    const alerts = candidates
      .sort(
        (a, b) =>
          Number(b.kind === 'spike' && b.count >= 25) -
            Number(a.kind === 'spike' && a.count >= 25) || b.count - a.count
      )
      .slice(0, MAX_BATCH);
    if (!alerts.length) return { outcome: 'ok', detail: { candidates: 0 } };
    if (!(await publish(context, slot, alerts)))
      return { outcome: 'failed', detail: { publish: 1 } };
    if (mode === 'test') {
      await checkMobileIssuesFence(context);
      await context.pending.add([TEST_RECEIPT]);
    }
    return {
      outcome: 'ok',
      detail: {
        candidates: candidates.length,
        ...(candidates.length > MAX_BATCH ? { clipped: 1 } : {}),
      },
    };
  } catch (error) {
    // Provider bodies and credentials never enter Cron Control's logs.
    return error instanceof MobileIssuesStopped
      ? { outcome: 'stopped', detail: {} }
      : { outcome: 'failed', detail: { collection: 1 } };
  }
}
