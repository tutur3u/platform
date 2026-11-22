import type { ProcessorContext, ProcessorResult } from '../types';
import { type ShipAppSpec, type ShipEnvName, shipCatalog } from './catalog';
import { cloudflareConfigured, MISSING_WORKER, readWorker } from './cloudflare';
import { collectGithubOwner, type GithubFacts } from './github';
import { githubConfigured } from './github-auth';
import { RequestBudget, ShipSourceError } from './http';
import {
  parseCollectorState,
  parseSnapshot,
  SHIP_COLLECTOR_KEY,
  SHIP_SNAPSHOT_KEY,
  SHIP_SNAPSHOT_TTL_MS,
  type ShipApp,
  type ShipSnapshot,
  type ShipSource,
  type ShipWorker,
  trimVersions,
} from './snapshot';
import { storeOps } from './store';

// Mastermind ship collector (Cron Control job `mastermind-ship`, every two
// minutes, plus owner "Check now" runs). It reads GitHub deployments, CI and
// pending commits and Cloudflare Worker versions within a fixed request
// budget, then writes one sanitized snapshot to the Mastermind store. A failed
// source keeps its last-known facts with their original freshness stamp; the
// next slot is the retry. See apps/docs/build/devops/mastermind-ship-collector.mdx.

export const SHIP_JOB = 'mastermind-ship';
export const SHIP_REQUEST_BUDGET = 32;

export type ShipEnv = {
  CLOUDFLARE_ACCOUNT_ID?: string;
  MASTERMIND_SHIP_CLOUDFLARE_TOKEN?: string;
  MASTERMIND_SHIP_GITHUB_APP_ID?: string;
  MASTERMIND_SHIP_GITHUB_APP_PRIVATE_KEY?: string;
  MASTERMIND_SHIP_GITHUB_TOKEN?: string;
  MASTERMIND_SHIP_REPOS?: string;
};

/** Scheduled slots are whole minutes; "Check now" claims a millisecond slot. */
export function isCheckSlot(slot: string | undefined) {
  return !!slot && !slot.endsWith(':00.000Z');
}

function iso(time: number) {
  return new Date(time).toISOString();
}

function failure(error: unknown): ShipSourceError {
  return error instanceof ShipSourceError
    ? error
    : new ShipSourceError('timeout');
}

function nextSource(
  previous: ShipSource | undefined,
  base: Pick<ShipSource, 'id' | 'name'>,
  now: number,
  outcome: 'ok' | 'unconfigured' | ShipSourceError
): ShipSource {
  if (outcome === 'ok')
    return {
      ...base,
      state: 'ok',
      checkedAt: iso(now),
      okAt: iso(now),
      retryAt: null,
      problem: null,
    };
  if (outcome === 'unconfigured')
    return {
      ...base,
      state: 'unconfigured',
      checkedAt: iso(now),
      okAt: previous?.okAt ?? null,
      retryAt: null,
      problem: 'not-configured',
    };
  return {
    ...base,
    state: outcome.retryAt ? 'backoff' : 'error',
    checkedAt: iso(now),
    okAt: previous?.okAt ?? null,
    retryAt: outcome.retryAt ? iso(outcome.retryAt) : null,
    problem: outcome.problem,
  };
}

const hasStaging = (spec: ShipAppSpec) =>
  spec.environments.staging === null ||
  spec.environments.staging.length > 0 ||
  !!spec.workers.staging;

export async function collectShip(
  context: ProcessorContext
): Promise<ProcessorResult> {
  const detail = { requests: 0, sourcesFailed: 0, apps: 0 };
  const result = (outcome: ProcessorResult['outcome']) => ({ outcome, detail });
  if (!(await context.fence())) return result('stopped');
  const env = context.env as ShipEnv;
  const read = await storeOps(context, [
    { op: 'mget', ks: [SHIP_SNAPSHOT_KEY, SHIP_COLLECTOR_KEY] },
  ]);
  if (!read.ok) return result(read.error === 'stopped' ? 'stopped' : 'failed');
  const [rawSnapshot, rawState] = (read.results[0] ?? []) as (string | null)[];
  const previous = parseSnapshot(rawSnapshot ?? null);
  const state = parseCollectorState(rawState ?? null);
  const prevSource = new Map(previous?.sources.map((s) => [s.id, s]) ?? []);
  const prevApp = new Map(previous?.apps.map((app) => [app.id, app]) ?? []);
  const catalog = shipCatalog(env.MASTERMIND_SHIP_REPOS);
  const budget = new RequestBudget(SHIP_REQUEST_BUDGET);
  const manual = isCheckSlot(context.slot);
  const deps = {
    deadline: context.deadline,
    fetch: context.fetch,
    now: context.now,
    signal: context.signal,
  };
  const sources: ShipSource[] = [];
  // A provider call failed in this run (not a source skipped by backoff).
  let failedThisRun = false;
  const github = new Map<string, GithubFacts>();

  // One source per repository, so an unreadable repository marks only its
  // own rows.
  const repositories = [
    ...new Set(
      catalog.flatMap((spec) => (spec.repository ? [spec.repository] : []))
    ),
  ];
  for (const repository of repositories) {
    if (!(await context.fence())) return result('stopped');
    const owner = repository.split('/')[0]!;
    const base = { id: `github:${repository}`, name: `GitHub ${repository}` };
    const before = prevSource.get(base.id);
    const now = context.now();
    const retryAt = before?.retryAt ? Date.parse(before.retryAt) : 0;
    const specs = catalog.filter((spec) => spec.repository === repository);
    if (!githubConfigured(env)) {
      sources.push(nextSource(before, base, now, 'unconfigured'));
      continue;
    }
    if (retryAt > now) {
      sources.push({ ...before!, state: 'backoff', checkedAt: iso(now) });
      continue;
    }
    try {
      const outcome = await collectGithubOwner(
        env,
        deps,
        budget,
        owner,
        specs,
        state,
        {
          force: manual,
          lastReadAt: before?.okAt ? Date.parse(before.okAt) : null,
        }
      );
      // A 304 confirms nothing new: `okAt` stays at the last full read,
      // which is also what bounds the reuse window.
      const source: ShipSource =
        outcome.kind === 'unchanged' && before
          ? {
              ...before,
              state: 'ok',
              checkedAt: iso(context.now()),
              retryAt: null,
              problem: null,
            }
          : nextSource(before, base, context.now(), 'ok');
      if (outcome.kind === 'read') {
        for (const [id, facts] of outcome.facts) github.set(id, facts);
        source.retryAt = outcome.retryAt ? iso(outcome.retryAt) : null;
      }
      sources.push(source);
    } catch (error) {
      failedThisRun = true;
      sources.push(nextSource(before, base, context.now(), failure(error)));
    }
  }

  const workers = new Map<string, ShipWorker | null>();
  const scripts = catalog.flatMap((spec) => Object.values(spec.workers));
  if (scripts.length > 0) {
    const base = { id: 'cloudflare', name: 'Cloudflare Workers' };
    const before = prevSource.get(base.id);
    const retryAt = before?.retryAt ? Date.parse(before.retryAt) : 0;
    if (!cloudflareConfigured(env)) {
      sources.push(nextSource(before, base, context.now(), 'unconfigured'));
    } else if (retryAt > context.now()) {
      sources.push({
        ...before!,
        state: 'backoff',
        checkedAt: iso(context.now()),
      });
    } else {
      let failed: ShipSourceError | null = null;
      let missing = 0;
      for (const script of scripts) {
        if (!(await context.fence())) return result('stopped');
        try {
          const read = await readWorker(
            env,
            deps,
            budget,
            script,
            state.versions
          );
          if (read === MISSING_WORKER) missing++;
          workers.set(script, read === MISSING_WORKER ? null : read);
        } catch (error) {
          failed = failure(error);
          if (failed.retryAt) break;
        }
      }
      // One missing script is an unpublished environment; every script
      // missing means the account or token is wrong, never "no Workers".
      if (!failed && missing === scripts.length) {
        failed = new ShipSourceError('invalid');
        // Keep every last-known Worker rather than erasing them all.
        workers.clear();
      }
      if (failed) failedThisRun = true;
      sources.push(nextSource(before, base, context.now(), failed ?? 'ok'));
    }
  }

  const apps: ShipApp[] = catalog.map((spec) => {
    const old = prevApp.get(spec.id);
    const facts = github.get(spec.id);
    const environment = (env: ShipEnvName) => {
      const script = spec.workers[env];
      const carried = env === 'production' ? old?.production : old?.staging;
      return {
        // An undecided read keeps the previous release with the newest
        // attempt's state.
        release:
          facts && facts[env] !== undefined
            ? facts[env]
            : carried?.release
              ? {
                  ...carried.release,
                  deploy: facts?.attempts[env] ?? carried.release.deploy,
                }
              : null,
        worker: script
          ? workers.has(script)
            ? workers.get(script)!
            : (carried?.worker ?? null)
          : null,
      };
    };
    return {
      id: spec.id,
      name: spec.name,
      repository: spec.repository,
      production: environment('production'),
      staging: hasStaging(spec) ? environment('staging') : null,
      pending:
        facts && facts.pending !== undefined
          ? facts.pending
          : (old?.pending ?? null),
      sources: [
        ...(spec.repository ? [`github:${spec.repository}`] : []),
        ...(Object.keys(spec.workers).length > 0 ? ['cloudflare'] : []),
      ],
    };
  });

  const snapshot: ShipSnapshot = {
    version: 1,
    collectedAt: iso(context.now()),
    trigger: manual ? 'check' : 'schedule',
    sources,
    apps,
  };
  const live = new Set(
    apps.flatMap((app) =>
      [app.production.worker, app.staging?.worker].flatMap((worker) =>
        worker ? [worker.versionId] : []
      )
    )
  );
  state.versions = trimVersions(state.versions, live);
  detail.requests = budget.used;
  detail.apps = apps.length;
  detail.sourcesFailed = sources.filter(
    (source) => source.state !== 'ok'
  ).length;
  if (!(await context.fence())) return result('stopped');
  const write = await storeOps(context, [
    {
      op: 'set',
      k: SHIP_SNAPSHOT_KEY,
      v: JSON.stringify(snapshot),
      ttlMs: SHIP_SNAPSHOT_TTL_MS,
      mode: 'always',
    },
    {
      op: 'set',
      k: SHIP_COLLECTOR_KEY,
      v: JSON.stringify(state),
      ttlMs: SHIP_SNAPSHOT_TTL_MS,
      mode: 'always',
    },
  ]);
  if (!write.ok)
    return result(write.error === 'stopped' ? 'stopped' : 'failed');
  // Every configured source failing counts against the job's five-slot
  // failure budget; a partial read is degraded, which does not.
  const configured = sources.filter((s) => s.state !== 'unconfigured');
  if (
    failedThisRun &&
    configured.length > 0 &&
    !configured.some((s) => s.state === 'ok')
  )
    return result('failed');
  return result(detail.sourcesFailed > 0 ? 'degraded' : 'ok');
}
