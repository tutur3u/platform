import { type CiCache, createCiCache, RateBudgetError } from './ci-cache';
import {
  assertRepo,
  fetchRateLimit,
  fetchRunsForSha,
  githubUpstream,
  resolveGithubToken,
  resolveSha,
} from './ci-github';
import { type CiStatus, renderStatus, summarizeRuns } from './ci-status';
import { parseDurationSeconds } from './devbox-duration';

export function ciHelp() {
  return `ttr ci — cached, deduplicated GitHub CI status for agent lanes

Usage:
  ttr ci status <owner/repo> <sha> [--workflow W]... [--json]
  ttr ci wait <owner/repo> <sha> [--workflow W]... [--timeout 45m]
              [--interval 60s] [--json]
  ttr ci rate-limit [--json]

Every lane on this machine shares one cache (~/.tuturuuu/ci-cache, or
TTR_CI_CACHE_HOME): one GitHub request per question at a time, ETag
revalidation (unchanged answers are free 304s), and short TTLs (20s while runs
are active, 120s once all completed). Below TTR_CI_RATE_FLOOR remaining core
requests (default 300) only free revalidations run; when the limit is exhausted
cached answers are served marked stale and \`wait\` sleeps until reset.

  --workflow W   workflow name, file name (ci.yaml) or path; repeatable
  --timeout D    wait deadline (default 45m); s/m/h suffixes
  --interval D   wait poll interval (default 60s, minimum 15s, jittered)
  --json         machine-readable output

Exit codes: 0 success (status: any state), 1 failed run, 2 usage,
124 wait timeout, 75 rate limited with no cached answer.
Use this instead of gh run watch / gh run list polling loops.
`;
}

interface CiArgs {
  action: 'status' | 'wait' | 'rate-limit';
  repo?: string;
  sha?: string;
  workflows: string[];
  json: boolean;
  timeoutMs: number;
  intervalMs: number;
}

const MIN_INTERVAL_MS = 15_000;

export function parseCiArgs(argv: string[]): CiArgs {
  const [action, ...rest] = argv;
  if (action !== 'status' && action !== 'wait' && action !== 'rate-limit')
    throw new Error(`Unknown ttr ci action: ${action ?? '(none)'}`);
  const args: CiArgs = {
    action,
    workflows: [],
    json: false,
    timeoutMs: 45 * 60_000,
    intervalMs: 60_000,
  };
  const positional: string[] = [];
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index]!;
    const value = () => {
      const next = rest[++index];
      if (next === undefined) throw new Error(`${arg} needs a value`);
      return next;
    };
    if (arg === '--json') args.json = true;
    else if (arg === '--workflow') args.workflows.push(value());
    else if (arg === '--timeout')
      args.timeoutMs = (parseDurationSeconds(value()) ?? 0) * 1000;
    else if (arg === '--interval')
      args.intervalMs = Math.max(
        MIN_INTERVAL_MS,
        (parseDurationSeconds(value()) ?? 0) * 1000
      );
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else positional.push(arg);
  }
  if (action !== 'rate-limit') {
    if (positional.length !== 2)
      throw new Error(`ttr ci ${action} needs <owner/repo> <sha>`);
    args.repo = assertRepo(positional[0]);
    args.sha = positional[1];
  } else if (positional.length)
    throw new Error('ttr ci rate-limit takes no arguments');
  return args;
}

export interface CiDeps {
  cache?: CiCache;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  write?: (text: string) => void;
  resolveSha?: (sha: string | undefined) => string;
}

function defaultCache() {
  let token: string | undefined;
  return createCiCache({
    upstream: githubUpstream(() => {
      token ??= resolveGithubToken();
      return token;
    }),
  });
}

function jitter(ms: number, random: () => number) {
  return Math.round(ms * (0.8 + random() * 0.4));
}

export async function runCiCommand(
  argv: string[],
  deps: CiDeps = {}
): Promise<number> {
  const write = deps.write ?? ((text) => process.stdout.write(text));
  if (!argv.length || argv[0] === 'help' || argv.includes('--help')) {
    write(ciHelp());
    return 0;
  }
  let args: CiArgs;
  try {
    args = parseCiArgs(argv);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n\n${ciHelp()}`);
    return 2;
  }
  const cache = deps.cache ?? defaultCache();
  const now = deps.now ?? Date.now;
  const sleep =
    deps.sleep ??
    ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const random = deps.random ?? Math.random;

  if (args.action === 'rate-limit') {
    const result = await fetchRateLimit(cache);
    const ledger = await cache.readLedger();
    const core = result.body.resources?.core;
    const graphql = result.body.resources?.graphql;
    if (args.json)
      write(
        `${JSON.stringify({ core, graphql, ledger, source: result.source, stale: result.stale }, null, 2)}\n`
      );
    else
      write(
        `${[
          core
            ? `core     ${core.remaining}/${core.limit}  resets ${new Date(core.reset * 1000).toISOString()}`
            : 'core     unknown',
          graphql
            ? `graphql  ${graphql.remaining}/${graphql.limit}  resets ${new Date(graphql.reset * 1000).toISOString()}`
            : 'graphql  unknown',
          ledger.blockedUntil && ledger.blockedUntil > now()
            ? `blocked until ${new Date(ledger.blockedUntil).toISOString()}`
            : `source   ${result.source}`,
        ].join('\n')}\n`
      );
    return 0;
  }

  const repo = args.repo!;
  let sha: string;
  try {
    sha = (deps.resolveSha ?? resolveSha)(args.sha);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 2;
  }
  const emit = (
    status: CiStatus,
    meta: { source: string; stale: boolean; staleReason?: string }
  ) =>
    write(
      args.json
        ? `${JSON.stringify({ repo, sha, ...status, ...meta })}\n`
        : `${renderStatus(repo, sha, status, meta)}\n`
    );

  if (args.action === 'status') {
    try {
      const result = await fetchRunsForSha(cache, repo, sha);
      emit(summarizeRuns(result.body, args.workflows), result);
      return 0;
    } catch (error) {
      if (error instanceof RateBudgetError) {
        process.stderr.write(`${error.message}\n`);
        return error.exitCode;
      }
      throw error;
    }
  }

  const deadline = now() + args.timeoutMs;
  let last:
    | { status: CiStatus; stale: boolean; staleReason?: string }
    | undefined;
  for (;;) {
    let resetAt = 0;
    try {
      const result = await fetchRunsForSha(cache, repo, sha);
      const status = summarizeRuns(result.body, args.workflows);
      last = { status, stale: result.stale, staleReason: result.staleReason };
      if (
        !result.stale &&
        !status.truncated &&
        (status.state === 'success' || status.state === 'failure')
      ) {
        emit(status, result);
        return status.state === 'success' ? 0 : 1;
      }
      // A stale answer under backpressure: wait for the reset, not the interval.
      if (result.stale && result.resetAt) resetAt = result.resetAt;
    } catch (error) {
      if (!(error instanceof RateBudgetError)) throw error;
      resetAt = error.resetAt ?? 0;
      process.stderr.write(`[ttr ci] ${error.message}; waiting\n`);
    }
    const remaining = deadline - now();
    if (remaining <= 0) {
      if (last) {
        const { status, ...meta } = last;
        emit(status, { source: 'timeout', ...meta });
      }
      process.stderr.write('[ttr ci] wait timed out\n');
      return 124;
    }
    await sleep(
      Math.min(
        Math.max(
          MIN_INTERVAL_MS,
          resetAt - now(),
          jitter(args.intervalMs, random)
        ),
        remaining
      )
    );
  }
}
