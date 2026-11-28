import { postPrivateRpc } from '../maintenance-rpc';
import { RequestBudget, ShipSourceError } from '../mastermind-ship/http';
import type { ProcessorContext, ProcessorResult } from '../types';
import {
  MAX_ALERT_FINDINGS,
  MAX_WORKERS,
  PROVIDER_REQUEST_BUDGET,
  RECONCILE_WORKERS,
  RUN_WALL_MS,
  type ReconcileWindowEnv,
  reconcileWindows,
} from './catalog';
import {
  cloudflareCredentials,
  githubToken,
  type ReconcileCredentialsEnv,
  readActiveDeployment,
  readBuildInfoSha,
  readFenceVariables,
  readProductionSha,
} from './sources';

export { RECONCILE_JOB } from './catalog';

// Read-only production auto-publish reconciler. Each admitted hourly slot
// reads the fence variables and the production ref from GitHub, then each
// automatic Worker's active Cloudflare deployment and public build-info, and
// flags stale stop fences, leftover split or 0% staged deployments, and
// Workers off the production SHA. It writes nothing to GitHub or Cloudflare.
// Flags go to root operators through private.send_root_operator_alert, whose
// dedupe key is a hash of the flagged facts: the same state alerts once. A
// provider API failure fails the slot without alerting, so a partial read
// never raises an alert for a subset; the next slot is the retry.

export const ALERT_RPC = 'send_root_operator_alert';
export const ALERT_KIND = 'auto_publish.reconcile';
const REF_ITEM = 'production-ref:';

export type ReconcileEnv = ReconcileCredentialsEnv & ReconcileWindowEnv;

export interface ReconcileFinding {
  ageMinutes: number;
  /** Stable identity of the flagged fact; it feeds the dedupe key. */
  id: string;
  kind: 'dark' | 'lag' | 'split' | 'stale-stop';
  subject: string;
}

type Detail = Record<string, number>;

function minutes(milliseconds: number) {
  return Math.max(0, Math.floor(milliseconds / 60_000));
}

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

/** One key per distinct flagged state, within the table's key pattern. */
export async function dedupeKey(findings: ReconcileFinding[]) {
  const ids = findings.map((finding) => finding.id).sort();
  return `auto-publish:reconcile:${(await sha256Hex(ids.join('\n'))).slice(0, 32)}`;
}

/**
 * The first time this job saw the production ref at `sha`, kept as one
 * pending-work item so the lag window starts when the ref moved, not at the
 * commit's own date. Adds before settling, so a lost write leaves at most two
 * items that the next run settles.
 */
async function refSeenAt(context: ProcessorContext, sha: string, now: number) {
  const items = (await context.pending.list()).filter((item) =>
    item.startsWith(REF_ITEM)
  );
  const prefix = `${REF_ITEM}${sha}:`;
  const current = items.find((item) => item.startsWith(prefix));
  const seen = current ? Number(current.slice(prefix.length)) : Number.NaN;
  const stale = items.filter((item) => item !== current);
  if (!Number.isSafeInteger(seen) || seen <= 0 || seen > now) {
    await context.pending.add([`${prefix}${now}`]);
    if (current) stale.push(current);
    if (stale.length) await context.pending.settle(stale);
    return now;
  }
  if (stale.length) await context.pending.settle(stale);
  return seen;
}

function describe(findings: ReconcileFinding[], counts: Detail, sha: string) {
  const lines = findings
    .slice(0, MAX_ALERT_FINDINGS)
    .map((f) => `- ${f.kind} ${f.subject} (${f.ageMinutes} min)`);
  return [
    `${counts.staleStops} stale stop fence(s), ${counts.splits} split deployment(s), ${counts.lagging} lagging Worker(s), ${counts.dark} dark Worker(s).`,
    sha ? `Production ${sha.slice(0, 12)}.` : 'Production ref unread.',
    ...lines,
  ]
    .join('\n')
    .slice(0, 2_000);
}

export async function reconcileAutoPublish(
  context: ProcessorContext
): Promise<ProcessorResult> {
  const detail: Detail = {
    alerts: 0,
    dark: 0,
    deduped: 0,
    flagged: 0,
    lagging: 0,
    requests: 0,
    sourcesFailed: 0,
    splits: 0,
    staleStops: 0,
    unconfigured: 0,
    unreadable: 0,
    workers: 0,
  };
  const budget = new RequestBudget(PROVIDER_REQUEST_BUDGET);
  const result = (outcome: ProcessorResult['outcome']) => {
    detail.requests = budget.used;
    return { outcome, detail };
  };
  if (!(await context.fence())) return result('stopped');
  const env = context.env as unknown as ReconcileEnv;
  const windows = reconcileWindows(env);
  const started = context.now();
  const deps = {
    deadline: Math.min(context.deadline, started + RUN_WALL_MS),
    fetch: context.fetch,
    now: context.now,
    signal: context.signal,
  };
  const github = githubToken(env);
  const cloudflare = cloudflareCredentials(env);
  if (!github) detail.unconfigured++;
  if (!cloudflare) detail.unconfigured++;
  if (!github && !cloudflare) return result('failed');

  const findings: ReconcileFinding[] = [];
  let productionSha = '';
  let seenAt: number | null = null;

  if (github) {
    try {
      const fences = await readFenceVariables(
        deps,
        budget,
        github,
        context.userAgent
      );
      const now = context.now();
      for (const fence of fences) {
        if (!fence.stopped) continue;
        const stale =
          fence.until !== null
            ? now > fence.until
            : now - fence.updatedAt > windows.stopWindowMs;
        if (!stale) continue;
        findings.push({
          ageMinutes: minutes(now - fence.updatedAt),
          id: `stop:${fence.name}:${fence.updatedAt}`,
          kind: 'stale-stop',
          subject: fence.name,
        });
      }
      if (!(await context.fence())) return result('stopped');
      productionSha = await readProductionSha(
        deps,
        budget,
        github,
        context.userAgent
      );
      seenAt = await refSeenAt(context, productionSha, context.now());
    } catch (error) {
      if (!(error instanceof ShipSourceError)) throw error;
      detail.sourcesFailed++;
    }
  }

  for (const worker of RECONCILE_WORKERS.slice(0, MAX_WORKERS)) {
    if (!(await context.fence())) return result('stopped');
    detail.workers++;
    let missingDeployment = false;
    if (cloudflare) {
      try {
        const active = await readActiveDeployment(
          deps,
          budget,
          cloudflare,
          worker.script
        );
        const now = context.now();
        if (!active) {
          detail.unreadable++;
          missingDeployment = true;
        } else if (
          (active.versions.length !== 1 ||
            active.versions[0]!.percentage !== 100) &&
          now - active.createdAt > windows.splitTtlMs
        )
          findings.push({
            ageMinutes: minutes(now - active.createdAt),
            id: `split:${worker.script}:${active.deploymentId}`,
            kind: 'split',
            subject: worker.script,
          });
      } catch (error) {
        if (!(error instanceof ShipSourceError)) throw error;
        detail.sourcesFailed++;
        // A refused or exhausted provider ends this run's reads.
        if (
          error.retryAt ||
          error.problem === 'rate-limited' ||
          error.problem === 'timeout'
        )
          break;
      }
    }
    if (!productionSha || seenAt === null) continue;
    let live: string | null = null;
    let stopReads = false;
    try {
      live = await readBuildInfoSha(
        deps,
        budget,
        worker.buildInfo,
        context.userAgent
      );
    } catch (error) {
      if (!(error instanceof ShipSourceError)) throw error;
      stopReads =
        error.problem === 'rate-limited' || error.problem === 'timeout';
    }
    if (!live) detail.unreadable++;

    const age = context.now() - seenAt;
    if (age > windows.lagWindowMs) {
      if (missingDeployment || !live) {
        findings.push({
          ageMinutes: minutes(age),
          id: `dark:${worker.script}:${productionSha}`,
          kind: 'dark',
          subject: worker.script,
        });
      } else if (live !== productionSha) {
        findings.push({
          ageMinutes: minutes(age),
          id: `lag:${worker.script}:${live}:${productionSha}`,
          kind: 'lag',
          subject: worker.script,
        });
      }
    }
    if (stopReads) break;
  }

  for (const finding of findings) {
    if (finding.kind === 'stale-stop') detail.staleStops++;
    else if (finding.kind === 'split') detail.splits++;
    else if (finding.kind === 'dark') detail.dark++;
    else detail.lagging++;
  }
  detail.flagged = findings.length;
  if (detail.sourcesFailed > 0) return result('failed');
  const partial = detail.unconfigured > 0 || detail.unreadable > 0;
  if (findings.length === 0) return result(partial ? 'degraded' : 'ok');

  if (!(await context.fence())) return result('stopped');
  const sent = await postPrivateRpc(context, ALERT_RPC, {
    p_kind: ALERT_KIND,
    p_dedupe_key: await dedupeKey(findings),
    p_title: `Auto-publish reconcile: ${findings.length} flagged`,
    p_description: describe(findings, detail, productionSha),
    p_data: {
      dark: detail.dark,
      flagged: detail.flagged,
      lagging: detail.lagging,
      splits: detail.splits,
      staleStops: detail.staleStops,
      workers: detail.workers,
      productionSha: productionSha || null,
      findings: findings
        .slice(0, MAX_ALERT_FINDINGS)
        .map(({ ageMinutes, kind, subject }) => ({
          ageMinutes,
          kind,
          subject,
        })),
    },
    p_permissions: ['view_infrastructure'],
    p_priority: 'high',
  });
  if (sent.kind === 'http') return result('failed');
  if (sent.kind === 'invalid') return result('unknown');
  if (sent.value === null) {
    detail.deduped = 1;
    return result(partial ? 'degraded' : 'ok');
  }
  if (typeof sent.value !== 'number' || !Number.isInteger(sent.value))
    return result('unknown');
  // Zero recipients releases the key, so the next slot delivers it again.
  if (sent.value === 0) return result('degraded');
  detail.alerts = 1;
  return result(partial ? 'degraded' : 'ok');
}
