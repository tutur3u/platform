/**
 * Shared, framework-free pieces of the ttr CLI eval pyramid: a route-table
 * fake HTTP layer, an isolated CLI home, output capture, secret scanning,
 * seeded fault plans and pass@k / pass^k scoring. Vitest wiring (module
 * tracking, resets and the invoker) lives in cli-eval-entry-test-fixtures.ts
 * so these helpers stay importable from any runner.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const EVAL_BASE_URL = 'https://platform.eval.test';
export const EVAL_TASKS_BASE_URL = 'https://tasks.eval.test';
export const NPM_LATEST_URL = 'https://registry.npmjs.org/tuturuuu/latest';

export const WORKSPACE_ID = '00000000-0000-4000-8000-0000000000a1';
export const BOARD_ID = '00000000-0000-4000-8000-0000000000b1';
export const LIST_ID = '00000000-0000-4000-8000-0000000000c1';
export const TASK_ID = '00000000-0000-4000-8000-0000000000d1';

export interface RecordedRequest {
  authorization: string | null;
  body: string | null;
  method: string;
  url: URL;
}

export type RouteHandler = (
  request: RecordedRequest,
  params: Record<string, string>
) => unknown | Response | Promise<unknown | Response>;

/** Keys are `METHOD origin/path`, where path segments may be `:param`. */
export type RouteTable = Record<string, RouteHandler>;

export interface FakeApi {
  fetch: typeof globalThis.fetch;
  requests: RecordedRequest[];
  unmatched: RecordedRequest[];
}

function matchRoute(pattern: string, request: RecordedRequest) {
  const [method, target] = pattern.split(' ', 2);
  if (!method || !target || method !== request.method) return undefined;
  const expected = new URL(target);
  if (expected.origin !== request.url.origin) return undefined;
  const want = expected.pathname.split('/');
  const got = request.url.pathname.split('/');
  if (want.length !== got.length) return undefined;
  const params: Record<string, string> = {};
  for (const [index, segment] of want.entries()) {
    const actual = got[index] ?? '';
    if (segment.startsWith(':')) params[segment.slice(1)] = actual;
    else if (segment !== actual) return undefined;
  }
  return params;
}

async function readBody(body: BodyInit | null | undefined) {
  if (body === undefined || body === null) return null;
  if (typeof body === 'string') return body;
  return new Response(body).text();
}

/**
 * A fetch that never reaches the network. Unrouted requests are recorded and
 * answered with 404 so a missing contract fails loudly instead of hanging.
 */
export function createFakeApi(routes: RouteTable): FakeApi {
  const requests: RecordedRequest[] = [];
  const unmatched: RecordedRequest[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : undefined;
    const headers = new Headers(init?.headers ?? request?.headers);
    const recorded: RecordedRequest = {
      authorization: headers.get('authorization'),
      body: await readBody(
        init?.body ?? (request ? await request.text() : null)
      ),
      method: (init?.method ?? request?.method ?? 'GET').toUpperCase(),
      url: new URL(request ? request.url : String(input)),
    };
    requests.push(recorded);
    const respond = async () => {
      for (const [pattern, handler] of Object.entries(routes)) {
        const params = matchRoute(pattern, recorded);
        if (!params) continue;
        const result = await handler(recorded, params);
        return result instanceof Response ? result : Response.json(result);
      }
      unmatched.push(recorded);
      return Response.json({ error: 'Not found' }, { status: 404 });
    };
    // Honor abort signals like real fetch, so a handler that never answers
    // exercises the caller's own timeout instead of hanging the eval.
    const signal = init?.signal ?? request?.signal;
    if (!signal) return respond();
    signal.throwIfAborted();
    return new Promise<Response>((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      respond()
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', onAbort));
    });
  }) as typeof globalThis.fetch;
  return { fetch, requests, unmatched };
}

/** Distinct, greppable credentials: any appearance in output is a leak. */
export const EVAL_SECRETS = {
  accessToken: 'ttr-eval-access-7f3c9a1e5b',
  refreshToken: 'ttr-eval-refresh-2d8e4b6a0c',
  rotatedAccessToken: 'ttr-eval-rotated-access-9b1d3f5e7a',
  rotatedRefreshToken: 'ttr-eval-rotated-refresh-4c6e8a0b2d',
} as const;

export function findLeakedSecrets(
  output: string,
  secrets: readonly string[] = Object.values(EVAL_SECRETS)
) {
  return secrets.filter((secret) => output.includes(secret));
}

export interface EvalHome {
  configPath: string;
  directory: string;
  readConfig: () => Promise<Record<string, unknown>>;
  remove: () => Promise<void>;
}

export type EvalSessionState = 'logged-in' | 'logged-out' | 'expired';

/** Writes a CLI config in a disposable directory for one invocation. */
export async function createEvalHome(
  session: EvalSessionState,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<EvalHome> {
  const directory = await mkdtemp(join(tmpdir(), 'ttr-cli-eval-'));
  const configPath = join(directory, 'config.json');
  const config: Record<string, unknown> = {
    baseUrl: EVAL_BASE_URL,
    currentWorkspaceId: WORKSPACE_ID,
    tasksBaseUrl: EVAL_TASKS_BASE_URL,
  };
  if (session !== 'logged-out') {
    config.session = {
      accessToken: EVAL_SECRETS.accessToken,
      expiresAt: session === 'expired' ? nowSeconds - 60 : nowSeconds + 3600,
      refreshExpiresAt: nowSeconds + 86_400,
      refreshToken: EVAL_SECRETS.refreshToken,
      tokenType: 'bearer',
    };
  }
  await writeFile(configPath, JSON.stringify(config));
  return {
    configPath,
    directory,
    readConfig: async () => JSON.parse(await readFile(configPath, 'utf8')),
    remove: () => rm(directory, { recursive: true, force: true }),
  };
}

export interface CapturedOutput {
  restore: () => void;
  stderr: () => string;
  stdout: () => string;
}

/** Captures process streams and console calls without echoing them. */
export function captureOutput(): CapturedOutput {
  const out: string[] = [];
  const err: string[] = [];
  const originals = {
    stdout: process.stdout.write,
    stderr: process.stderr.write,
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  const sink =
    (target: string[]) =>
    (chunk: unknown, ...rest: unknown[]) => {
      target.push(
        typeof chunk === 'string'
          ? chunk
          : Buffer.from(chunk as Uint8Array).toString()
      );
      const callback = rest.find((value) => typeof value === 'function');
      if (typeof callback === 'function') callback();
      return true;
    };
  const line =
    (target: string[]) =>
    (...values: unknown[]) => {
      target.push(`${values.map(String).join(' ')}\n`);
    };
  process.stdout.write = sink(out) as typeof process.stdout.write;
  process.stderr.write = sink(err) as typeof process.stderr.write;
  console.log = line(out);
  console.info = line(out);
  console.warn = line(err);
  console.error = line(err);
  return {
    restore: () => {
      process.stdout.write = originals.stdout;
      process.stderr.write = originals.stderr;
      console.log = originals.log;
      console.info = originals.info;
      console.warn = originals.warn;
      console.error = originals.error;
    },
    stderr: () => err.join(''),
    stdout: () => out.join(''),
  };
}

/**
 * mulberry32 over a scrambled seed: tiny and stable across runtimes, and
 * neighbouring seeds (1, 2, 3...) still draw unrelated sequences.
 */
export function createSeededRandom(seed: number) {
  let state = Math.imul((seed ^ 0x9e3779b9) >>> 0, 0x85ebca6b) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Picks by seed in rotation, so any run of `values.length` consecutive seeds
 * covers every value exactly once.
 */
export function cycleSeeded<T>(seed: number, values: readonly T[]) {
  const value =
    values[((seed % values.length) + values.length) % values.length];
  if (value === undefined) throw new Error('cycleSeeded needs values.');
  return value;
}

function binomial(n: number, k: number) {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let index = 1; index <= k; index++) {
    result = (result * (n - k + index)) / index;
  }
  return result;
}

/**
 * Unbiased pass@k estimate from n trials with c passes: the chance that at
 * least one of k sampled trials passes (Chen et al., 2021).
 */
export function passAtK(n: number, c: number, k: number) {
  assertTrialCounts(n, c, k);
  if (n - c < k) return 1;
  return 1 - binomial(n - c, k) / binomial(n, k);
}

/** pass^k estimate: the chance that all k sampled trials pass. */
export function passHatK(n: number, c: number, k: number) {
  assertTrialCounts(n, c, k);
  return binomial(c, k) / binomial(n, k);
}

function assertTrialCounts(n: number, c: number, k: number) {
  if (
    ![n, c, k].every(Number.isInteger) ||
    n < 1 ||
    c < 0 ||
    c > n ||
    k < 1 ||
    k > n
  ) {
    throw new Error(`Invalid trial counts: n=${n} c=${c} k=${k}`);
  }
}

export interface TrialOutcome {
  detail?: string;
  passed: boolean;
  seed: number;
}

export interface ScenarioReport {
  k: number;
  n: number;
  name: string;
  passAtK: number;
  passHatK: number;
  passes: number;
  trials: TrialOutcome[];
}

/**
 * Runs one scenario once per seed. A trial passes when it resolves and fails
 * with its error message when it throws, so a flaky path shows up as
 * pass@k = 1 with pass^k < 1 instead of a single red run.
 */
export async function runRepeatedScenario({
  k,
  name,
  seeds,
  trial,
}: {
  k: number;
  name: string;
  seeds: readonly number[];
  trial: (seed: number) => Promise<void>;
}): Promise<ScenarioReport> {
  const trials: TrialOutcome[] = [];
  for (const seed of seeds) {
    try {
      await trial(seed);
      trials.push({ passed: true, seed });
    } catch (error) {
      trials.push({
        detail: error instanceof Error ? error.message : String(error),
        passed: false,
        seed,
      });
    }
  }
  const passes = trials.filter((outcome) => outcome.passed).length;
  return {
    k,
    n: trials.length,
    name,
    passAtK: passAtK(trials.length, passes, k),
    passHatK: passHatK(trials.length, passes, k),
    passes,
    trials,
  };
}

/** Writes reports when TTR_EVAL_REPORT names a JSON file; otherwise a no-op. */
export async function writeEvalReport(
  reports: ScenarioReport[],
  path = process.env.TTR_EVAL_REPORT
) {
  if (!path) return;
  await writeFile(
    path,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2)}\n`
  );
}
