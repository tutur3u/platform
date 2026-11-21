/**
 * Eval pyramid, second tier: repeated scenarios for retry- and timeout-prone
 * paths. Each scenario runs once per deterministic seed; the seed picks the
 * injected fault and the interleaving of concurrent responses. Reports give
 * pass@k (works at least once in k tries) and pass^k (works every time in k
 * tries); agents need pass^k, so every scenario here must reach 1.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { installSafeBaseline, invokeTtr } from './cli-eval-entry-test-fixtures';
import {
  createEvalHome,
  createFakeApi,
  createSeededRandom,
  cycleSeeded,
  EVAL_BASE_URL,
  EVAL_SECRETS,
  EVAL_TASKS_BASE_URL,
  type FakeApi,
  NPM_LATEST_URL,
  passAtK,
  passHatK,
  type RouteHandler,
  type RouteTable,
  runRepeatedScenario,
  type ScenarioReport,
  writeEvalReport,
} from './cli-eval-test-fixtures';
import {
  createRefreshRoute,
  createWorldRoutes,
  routeKeys,
} from './cli-eval-world-test-fixtures';

vi.mock('../../commands.js', async (importOriginal) =>
  (await import('./cli-eval-entry-test-fixtures.js')).trackEntryModule(
    await importOriginal<typeof import('../../commands')>(),
    'runCli'
  )
);

let baseline: { directory: string; restore: () => void } | undefined;
beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ttr-cli-eval-baseline-'));
  baseline = { directory, restore: installSafeBaseline(directory) };
});
afterAll(async () => {
  baseline?.restore();
  if (baseline) await rm(baseline.directory, { force: true, recursive: true });
});

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const K = 4;
const reports: ScenarioReport[] = [];

/** Delays every handler by a seeded number of macrotask turns. */
function withSeededLatency(
  routes: RouteTable,
  random: () => number
): RouteTable {
  return Object.fromEntries(
    Object.entries(routes).map(([key, handler]): [string, RouteHandler] => [
      key,
      async (request, params) => {
        const turns = Math.floor(random() * 4);
        for (let turn = 0; turn < turns; turn++) {
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
        return handler(request, params);
      },
    ])
  );
}

const ALLOWED_ORIGINS = new Set([
  EVAL_BASE_URL,
  EVAL_TASKS_BASE_URL,
  new URL(NPM_LATEST_URL).origin,
]);

/** The invariants the contract evals enforce, as trial failures. */
function assertCleanRun(
  result: Awaited<ReturnType<typeof invokeTtr>>,
  api: FakeApi
) {
  if (result.leakedSecrets.length) {
    throw new Error(`Leaked credentials: ${result.leakedSecrets.join(', ')}`);
  }
  if (/\n\s+at\s/u.test(`${result.stdout}\n${result.stderr}`))
    throw new Error('Stack trace in output.');
  if (api.unmatched.length) {
    throw new Error(
      `Unrouted requests: ${api.unmatched.map((request) => `${request.method} ${request.url.href}`).join(', ')}`
    );
  }
  const foreign = api.requests.find(
    (request) => !ALLOWED_ORIGINS.has(request.url.origin)
  );
  if (foreign) throw new Error(`Off-platform request: ${foreign.url.href}`);
}

interface Scenario {
  name: string;
  trial: (seed: number) => Promise<void>;
}

const scenarios: Scenario[] = [
  {
    name: 'expired session refreshes once across concurrent whoami requests',
    trial: async (seed) => {
      const random = createSeededRandom(seed);
      const refresh = createRefreshRoute();
      const home = await createEvalHome('expired');
      try {
        const api = createFakeApi(
          withSeededLatency(
            createWorldRoutes({ [routeKeys.refresh]: refresh.handler }),
            random
          )
        );
        const result = await invokeTtr(['whoami', '--json'], { api, home });
        assertCleanRun(result, api);
        if (result.exitCode !== 0)
          throw new Error(`exit ${result.exitCode}: ${result.stderr}`);
        if (refresh.count() !== 1)
          throw new Error(`refreshed ${refresh.count()} times`);
        const stale = api.requests.filter(
          (request) =>
            request.authorization === `Bearer ${EVAL_SECRETS.accessToken}`
        );
        if (stale.length) throw new Error('Sent the expired access token.');
        const saved = (await home.readConfig()).session as Record<
          string,
          unknown
        >;
        if (saved.refreshToken !== `${EVAL_SECRETS.rotatedRefreshToken}-1`) {
          throw new Error('Rotated session was not persisted.');
        }
      } finally {
        await home.remove();
      }
    },
  },
  {
    name: 'revoked access token is refreshed and the request retried',
    trial: async (seed) => {
      const random = createSeededRandom(seed);
      const refresh = createRefreshRoute();
      const home = await createEvalHome('logged-in');
      const rejectOriginal =
        (handler: RouteHandler): RouteHandler =>
        (request, params) =>
          request.authorization === `Bearer ${EVAL_SECRETS.accessToken}`
            ? Response.json({ error: 'Unauthorized' }, { status: 401 })
            : handler(request, params);
      try {
        const world = createWorldRoutes({
          [routeKeys.refresh]: refresh.handler,
        });
        const routes = Object.fromEntries(
          Object.entries(world).map(([key, handler]) => [
            key,
            key === routeKeys.refresh ? handler : rejectOriginal(handler),
          ])
        );
        const api = createFakeApi(withSeededLatency(routes, random));
        const result = await invokeTtr(['tasks', 'list', '--json'], {
          api,
          home,
        });
        assertCleanRun(result, api);
        if (result.exitCode !== 0)
          throw new Error(`exit ${result.exitCode}: ${result.stderr}`);
        const tasks = result.json<{ tasks: unknown[] }>().tasks;
        if (tasks.length !== 1)
          throw new Error('Retried request lost its result.');
        const saved = (await home.readConfig()).session as Record<
          string,
          unknown
        >;
        if (
          saved.refreshToken !==
          `${EVAL_SECRETS.rotatedRefreshToken}-${refresh.count()}`
        ) {
          throw new Error('Persisted session is not the latest rotation.');
        }
      } finally {
        await home.remove();
      }
    },
  },
  {
    name: 'a slow or failing update registry never breaks a --json command',
    trial: async (seed) => {
      const failure = cycleSeeded(seed, [
        'timeout',
        'network',
        'unavailable',
        'malformed',
        'newer',
      ] as const);
      const registry: RouteHandler = () => {
        // Never answers: only the update check's own abort timeout ends it.
        if (failure === 'timeout') return new Promise<never>(() => {});
        if (failure === 'network') throw new TypeError('fetch failed');
        if (failure === 'unavailable')
          return new Response('busy', { status: 503 });
        if (failure === 'malformed')
          return new Response('{"version":', { status: 200 });
        return { version: '999.0.0' };
      };
      const home = await createEvalHome('logged-in');
      try {
        const api = createFakeApi(
          createWorldRoutes({ [`GET ${NPM_LATEST_URL}`]: registry })
        );
        const result = await invokeTtr(['tasks', 'list', '--json'], {
          api,
          home,
          updateCheck: true,
        });
        assertCleanRun(result, api);
        if (result.exitCode !== 0)
          throw new Error(`${failure}: exit ${result.exitCode}`);
        if (result.stderr !== '')
          throw new Error(`${failure}: stderr ${result.stderr}`);
        result.json();
        if (
          !api.requests.some((request) => request.url.href === NPM_LATEST_URL)
        ) {
          throw new Error('Update check did not run.');
        }
        const checked = (await home.readConfig()).updateCheck as {
          checkedAt?: string;
        };
        if (!checked?.checkedAt)
          throw new Error(`${failure}: check time not recorded.`);
      } finally {
        await home.remove();
      }
    },
  },
  {
    name: 'transient API failures fail fast with one clean error line',
    trial: async (seed) => {
      // Eight consecutive seeds cover every target x failure pair once.
      const target = cycleSeeded(seed, [
        routeKeys.workspaces,
        routeKeys.listTasks,
      ] as const);
      const failure = cycleSeeded(Math.floor(seed / 2), [
        () => Response.json({ error: 'Service unavailable' }, { status: 503 }),
        () => new Response('<html>bad gateway</html>', { status: 502 }),
        () => Response.json({ error: 'Too many requests' }, { status: 429 }),
        () => {
          throw new TypeError('fetch failed');
        },
      ]);
      const home = await createEvalHome('logged-in');
      try {
        const api = createFakeApi(createWorldRoutes({ [target]: failure }));
        const result = await invokeTtr(['tasks', 'list', '--json'], {
          api,
          home,
        });
        assertCleanRun(result, api);
        if (result.exitCode !== 1) throw new Error(`exit ${result.exitCode}`);
        if (result.stdout !== '') throw new Error('Partial stdout on failure.');
        const lines = result.stderr.trimEnd().split('\n');
        if (lines.length !== 1 || !lines[0]) {
          throw new Error(
            `Expected one error line, got ${JSON.stringify(result.stderr)}`
          );
        }
        const attempts = api.requests.filter((request) =>
          target === routeKeys.workspaces
            ? request.url.pathname === '/api/v1/workspaces'
            : request.url.pathname.endsWith('/tasks')
        );
        if (attempts.length !== 1)
          throw new Error(`Retried ${attempts.length} times.`);
      } finally {
        await home.remove();
      }
    },
  },
];

describe('pass@k scoring', () => {
  it('matches the closed forms for small trial counts', () => {
    expect(passAtK(4, 0, 2)).toBe(0);
    expect(passAtK(4, 4, 2)).toBe(1);
    expect(passAtK(4, 2, 1)).toBe(0.5);
    expect(passAtK(4, 2, 2)).toBeCloseTo(1 - 1 / 6);
    expect(passAtK(4, 2, 3)).toBe(1);
    expect(passHatK(4, 2, 1)).toBe(0.5);
    expect(passHatK(4, 2, 2)).toBeCloseTo(1 / 6);
    expect(passHatK(4, 2, 3)).toBe(0);
    expect(passHatK(8, 8, 4)).toBe(1);
    expect(() => passAtK(2, 3, 1)).toThrow('Invalid trial counts');
    expect(() => passHatK(2, 1, 3)).toThrow('Invalid trial counts');
  });

  it('separates a flaky scenario from a reliable one', async () => {
    const report = await runRepeatedScenario({
      k: 2,
      name: 'fails on odd seeds',
      seeds: [1, 2, 3, 4],
      trial: async (seed) => {
        if (seed % 2) throw new Error(`seed ${seed} failed`);
      },
    });
    expect(report).toMatchObject({ n: 4, passes: 2, passAtK: 1 - 1 / 6 });
    expect(report.passHatK).toBeCloseTo(1 / 6);
    expect(report.trials.filter((trial) => !trial.passed)).toEqual([
      { detail: 'seed 1 failed', passed: false, seed: 1 },
      { detail: 'seed 3 failed', passed: false, seed: 3 },
    ]);
  });

  it('draws the same faults for the same seed', () => {
    const draw = (seed: number) => {
      const random = createSeededRandom(seed);
      return Array.from({ length: 5 }, () => random());
    };
    expect(draw(7)).toEqual(draw(7));
    expect(draw(7)).not.toEqual(draw(8));
  });

  it('cycles fault modes so consecutive seeds cover all of them', () => {
    const modes = ['a', 'b', 'c'] as const;
    expect([1, 2, 3].map((seed) => cycleSeeded(seed, modes)).sort()).toEqual([
      ...modes,
    ]);
    const pairs = SEEDS.map(
      (seed) =>
        `${cycleSeeded(seed, [0, 1])}:${cycleSeeded(Math.floor(seed / 2), [0, 1, 2, 3])}`
    );
    expect(new Set(pairs).size).toBe(8);
  });
});

describe('ttr reliability evals', () => {
  afterAll(async () => {
    await writeEvalReport(reports);
  });

  it.each(scenarios.map((scenario) => [scenario.name, scenario] as const))(
    '%s',
    async (name, scenario) => {
      const report = await runRepeatedScenario({
        k: K,
        name,
        seeds: SEEDS,
        trial: scenario.trial,
      });
      reports.push(report);
      expect(report.trials.filter((trial) => !trial.passed)).toEqual([]);
      expect(report.passHatK).toBe(1);
    },
    30_000
  );
});
