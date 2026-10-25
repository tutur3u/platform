import { createHash, randomUUID } from 'node:crypto';
import {
  link,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  type BalancerRun,
  type BalancerRunRequest,
  type BalancerSource,
  RUN_ID_PATTERN,
  runsForRequest,
} from '@tuturuuu/devbox';
import { writeFileAtomically } from './atomic-file';

// Controller-side durable ledger. Every mutation is a compare-and-swap on
// the run revision inside one short ledger lock, so two controller processes
// can never both win the same transition (for example queued -> placed).
export const balancerHome = (env: NodeJS.ProcessEnv = process.env) =>
  resolve(env.TTR_BALANCER_HOME || join(homedir(), '.tuturuuu', 'balancer'));

const canonical = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(',')}]`
    : value && typeof value === 'object'
      ? `{${Object.keys(value)
          .sort()
          .filter(
            (key) => (value as Record<string, unknown>)[key] !== undefined
          )
          .map(
            (key) =>
              `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`
          )
          .join(',')}}`
      : JSON.stringify(value);
export const sourceIdentity = (source: BalancerSource) =>
  createHash('sha256').update(canonical(source)).digest('hex');

type RequestMarker = {
  request: BalancerRunRequest;
  sourceId: string;
  createdAt: string;
  state?: 'intent' | 'committed';
};

// Publishes a complete file only if `path` does not exist yet; an existing
// file is left untouched. link(2) is atomic and fails with EEXIST.
async function createExclusively(path: string, contents: string) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, contents, { mode: 0o600, flag: 'wx' });
  try {
    await link(temporary, path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
}

export class BalancerConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BalancerConflictError';
  }
}

function processAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

export class BalancerLedger {
  readonly root: string;
  constructor(home = balancerHome()) {
    this.root = join(home, 'ledger');
  }
  private runPath(runId: string) {
    if (!RUN_ID_PATTERN.test(runId)) throw new Error('Invalid run ID.');
    return join(this.root, 'runs', `${runId}.json`);
  }
  private requestPath(requestId: string) {
    return join(this.root, 'requests', `${requestId}.json`);
  }

  // Short mutual exclusion; a lock left by a dead process is taken over.
  async withLock<T>(action: () => Promise<T>): Promise<T> {
    const lock = join(this.root, '.lock');
    await mkdir(join(this.root, 'runs'), { recursive: true, mode: 0o700 });
    await mkdir(join(this.root, 'requests'), { recursive: true, mode: 0o700 });
    for (let attempt = 0; ; attempt++) {
      try {
        await mkdir(lock, { mode: 0o700 });
        await writeFile(join(lock, 'pid'), String(process.pid));
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const pid = Number(
          await readFile(join(lock, 'pid'), 'utf8').catch(() => '')
        );
        if (Number.isInteger(pid) && pid > 1 && !processAlive(pid))
          await rm(lock, { recursive: true, force: true });
        else if (attempt > 600)
          throw new Error('Balancer ledger lock is held.');
        else await sleep(50);
      }
    }
    try {
      return await action();
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }

  async readRun(runId: string): Promise<BalancerRun | undefined> {
    try {
      return JSON.parse(await readFile(this.runPath(runId), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }
  async listRuns(requestId?: string): Promise<BalancerRun[]> {
    const names = await readdir(join(this.root, 'runs')).catch(() => []);
    const runs: BalancerRun[] = [];
    for (const name of names.filter((entry) => entry.endsWith('.json'))) {
      const run = await this.readRun(name.slice(0, -5)).catch(() => undefined);
      if (run && (!requestId || run.requestId === requestId)) runs.push(run);
    }
    return runs.sort(
      (a, b) =>
        a.queuedAt.localeCompare(b.queuedAt) || a.runId.localeCompare(b.runId)
    );
  }

  /**
   * Idempotent submit: the same request ID returns its existing runs.
   *
   * The request intent is created exclusively before any runnable file is
   * exposed. A retry after a partial submit only adds missing run files and
   * never rewrites an existing run, so a run another controller already
   * placed keeps its state and lease.
   */
  async submit(request: BalancerRunRequest, at = new Date().toISOString()) {
    return this.withLock(async () => {
      const path = this.requestPath(request.requestId);
      const existing = await readFile(path, 'utf8').catch(() => undefined);
      let marker: RequestMarker;
      if (existing !== undefined) {
        marker = JSON.parse(existing);
        if (canonical(marker.request) !== canonical(request))
          throw new BalancerConflictError(
            `Request ${request.requestId} already exists with different parameters.`
          );
        // Markers without a state predate intents and were written last.
        if (marker.state !== 'intent')
          return {
            created: false,
            runs: await this.listRuns(request.requestId),
          };
      } else {
        marker = {
          request,
          sourceId: sourceIdentity(request.source),
          createdAt: at,
          state: 'intent',
        };
        await createExclusively(path, JSON.stringify(marker));
      }
      for (const run of runsForRequest(
        request,
        marker.sourceId,
        marker.createdAt
      ))
        await createExclusively(this.runPath(run.runId), JSON.stringify(run));
      await writeFileAtomically(
        path,
        JSON.stringify({ ...marker, state: 'committed' }),
        { mode: 0o600 }
      );
      return {
        created: existing === undefined,
        runs: await this.listRuns(request.requestId),
      };
    });
  }

  /**
   * Applies `mutate` only if the stored revision still equals `expected`.
   * Returns the stored run after the attempt and whether this call won.
   */
  async update(
    runId: string,
    expected: number,
    mutate: (run: BalancerRun) => BalancerRun
  ) {
    return this.withLock(async () => {
      const current = await this.readRun(runId);
      if (!current) throw new Error(`Run ${runId} does not exist.`);
      if (current.revision !== expected) return { won: false, run: current };
      const next = mutate(current);
      if (next === current) return { won: true, run: current };
      await writeFileAtomically(this.runPath(runId), JSON.stringify(next), {
        mode: 0o600,
      });
      return { won: true, run: next };
    });
  }
}
