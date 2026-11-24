import type { Ledger, ResourceState } from './ledger';
import { OWNER_KINDS } from './ledger';
import { LIMITS, QA_PURPOSE } from './policy';
import { cleanupIncomplete, type TuturuuuQaClient } from './tuturuuu-qa';
import type { PurgeResult, UpskiiProvisioner } from './upskii';

/**
 * Cleanup engine. It deletes through owner roots only, so a crashed test
 * that never ran its own product-API teardown is still covered:
 *   - a Tuturuuu QA run deletes its accounts and run workspace, and with them
 *     meetings, meeting records, uploads and external account links;
 *   - an Upskii QA identity purge hard-deletes everything that identity owns.
 * Every step is idempotent. `verify` re-reads the server and returns leaks;
 * `sweep` finds owners that earlier runs left behind.
 */

export interface CleanupDeps {
  tuturuuu: TuturuuuQaClient;
  upskii: UpskiiProvisioner;
  now?: () => number;
}

export interface Leak {
  key: string;
  kind: string;
  reason: string;
}

const PURGE_ROUNDS = 10;
const SWEEP_PAGES = 5;

/** An empty listing proves nothing: a deleted run still lists its rows. */
function runGone(rows: { deletedAt: string | null }[]) {
  return rows.length > 0 && rows.every((u) => u.deletedAt !== null);
}

function purgeClean(result: PurgeResult) {
  if (result.more) return false;
  const zero = Object.values(result.counts).every((count) => count === 0);
  return result.purge?.clean === undefined ? zero : result.purge.clean && zero;
}

async function purgeIdentity(deps: CleanupDeps, userId: string) {
  for (let round = 0; round < PURGE_ROUNDS; round += 1) {
    const result = await deps.upskii.purge(userId, 'apply');
    if (!result.more) return result;
  }
  throw new Error('Upskii purge did not converge');
}

async function cleanOwner(deps: CleanupDeps, owner: ResourceState) {
  if (!owner.id) return 'never-created';
  if (owner.kind === 'tuturuuu-qa-run') {
    const incomplete = cleanupIncomplete(
      await deps.tuturuuu.cleanupRun(owner.id)
    );
    if (incomplete)
      throw new Error(`Tuturuuu cleanup incomplete: ${incomplete}`);
    return 'deleted';
  }
  await purgeIdentity(deps, owner.id);
  return 'purged';
}

/** Delete every owner in reverse registration order; never throws early. */
export async function cleanup(ledger: Ledger, deps: CleanupDeps) {
  const now = deps.now ?? Date.now;
  const deadline = now() + LIMITS.cleanupDeadlineMs;
  const owners = ledger
    .read()
    .filter((r) => OWNER_KINDS.has(r.kind) && !r.cleaned)
    .reverse();
  const failures: string[] = [];
  for (const owner of owners) {
    if (now() > deadline) {
      failures.push(`${owner.key}: cleanup deadline reached`);
      continue;
    }
    try {
      ledger.cleaned(owner.key, await cleanOwner(deps, owner));
    } catch (error) {
      ledger.failed(owner.key, error);
      failures.push(`${owner.key}: ${(error as Error).message}`);
    }
  }
  return failures;
}

/** Re-read the server for every owner; anything still present is a leak. */
export async function verify(ledger: Ledger, deps: CleanupDeps) {
  const leaks: Leak[] = [];
  const states = ledger.read();
  for (const state of states) {
    if (!OWNER_KINDS.has(state.kind)) {
      const owner = states.find((s) => s.key === state.coveredBy);
      if (!owner || !OWNER_KINDS.has(owner.kind))
        leaks.push({
          key: state.key,
          kind: state.kind,
          reason: 'no owner covers this resource',
        });
      continue;
    }
    if (!state.id) {
      // Creation never returned an id: the sweep below finds it by marker.
      continue;
    }
    try {
      const gone =
        state.kind === 'tuturuuu-qa-run'
          ? runGone(await deps.tuturuuu.list(state.id))
          : purgeClean(await deps.upskii.purge(state.id, 'verify'));
      ledger.verified(state.key, gone);
      if (!gone)
        leaks.push({
          key: state.key,
          kind: state.kind,
          reason: 'still present',
        });
    } catch (error) {
      leaks.push({
        key: state.key,
        kind: state.kind,
        reason: `verify failed: ${(error as Error).message}`,
      });
    }
  }
  return leaks;
}

/**
 * Orphan sweep. Only one run executes at a time (workflow concurrency), so
 * at the start of a run, or from the daily sweep, every remaining suite
 * owner belongs to an earlier run. `keepRun` protects the current run when
 * the sweep runs after it registers owners.
 */
export async function sweep(
  deps: CleanupDeps,
  keep: { tuturuuuRunIds?: string[]; upskiiRunLabel?: string } = {}
) {
  const swept: string[] = [];
  const failures: string[] = [];
  const keepRuns = new Set(keep.tuturuuuRunIds ?? []);
  const users = await deps.tuturuuu.list();
  const runs = new Set(
    users
      .filter(
        (u) =>
          u.purpose === QA_PURPOSE &&
          u.deletedAt === null &&
          !keepRuns.has(u.runId)
      )
      .map((u) => u.runId)
  );
  for (const runId of runs) {
    try {
      const incomplete = cleanupIncomplete(
        await deps.tuturuuu.cleanupRun(runId)
      );
      if (incomplete) throw new Error(`incomplete: ${incomplete}`);
      swept.push(`tuturuuu-run:${runId}`);
    } catch (error) {
      failures.push(`tuturuuu-run:${runId}: ${(error as Error).message}`);
    }
  }
  // The provisioner lists only unpurged, marked per-run identities, 100 per
  // page; purged identities drop out, so re-list while it reports more.
  const tried = new Set<string>();
  for (let page = 0; page < SWEEP_PAGES; page += 1) {
    const { users, more } = await deps.upskii.list({});
    const fresh = users.filter(
      (identity) =>
        identity.runLabel &&
        identity.runLabel !== keep.upskiiRunLabel &&
        !tried.has(identity.userId)
    );
    for (const identity of fresh) {
      tried.add(identity.userId);
      try {
        await purgeIdentity(deps, identity.userId);
        swept.push(`upskii-identity:${identity.userId}`);
      } catch (error) {
        failures.push(
          `upskii-identity:${identity.userId}: ${(error as Error).message}`
        );
      }
    }
    if (!more) return { swept, failures };
    if (fresh.length === 0) break;
  }
  // Enumeration did not finish: report it so the run fails loudly.
  failures.push('upskii-identities: listing incomplete after sweep');
  return { swept, failures };
}
