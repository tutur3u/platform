/**
 * Runs the real `ttr` entrypoint (`src/cli/index.ts`) in-process. Each eval
 * test file wraps the dispatched command modules with `trackEntryModule` in
 * its `vi.mock` factories so the invoker can await the command the entry
 * started, then reads the exit code and output the entry itself produced.
 */
import { vi } from 'vitest';
import {
  captureOutput,
  type EvalHome,
  type FakeApi,
  findLeakedSecrets,
} from './cli-eval-test-fixtures';

const PENDING_KEY = Symbol.for('tuturuuu.cli-evals.pending-entry');

/** Survives `vi.resetModules()`, which re-evaluates this module. */
function pendingEntries(): Promise<unknown>[] {
  const store = globalThis as typeof globalThis & {
    [PENDING_KEY]?: Promise<unknown>[];
  };
  store[PENDING_KEY] ??= [];
  return store[PENDING_KEY];
}

/** Wraps one dispatched export so its completion becomes observable. */
export function trackEntryModule<T extends Record<string, unknown>>(
  module: T,
  exportName: keyof T & string
): T {
  const original = module[exportName];
  if (typeof original !== 'function') {
    throw new Error(`${exportName} is not a dispatched command function.`);
  }
  return {
    ...module,
    [exportName]: (...args: unknown[]) => {
      const result = Promise.resolve().then(() => original(...args));
      pendingEntries().push(result);
      return result;
    },
  };
}

/** Node prints its own experimental-feature notices; they are not CLI output. */
function withoutRuntimeWarnings(stderr: string) {
  return stderr
    .split('\n')
    .filter(
      (line) =>
        !/^\(node:\d+\) \w*Warning: /.test(line) &&
        !line.startsWith('(Use `node --trace-warnings')
    )
    .join('\n');
}

export interface TtrInvocation {
  exitCode: number;
  json: <T = unknown>() => T;
  leakedSecrets: string[];
  stderr: string;
  stdout: string;
}

const SAFE_BASELINE_ENV = [
  'HOME',
  'TUTURUUU_CONFIG',
  'TUTURUUU_DISABLE_UPDATE_CHECK',
  'XDG_CONFIG_HOME',
] as const;

/**
 * Points the process at a disposable home and a fetch that always rejects for
 * the whole test file. Per-invocation stubs restore onto these values, so a
 * command that outlives a failed invocation still cannot reach the network
 * or the real CLI config. Returns the restore function for `afterAll`.
 */
export function installSafeBaseline(directory: string) {
  const previousEnv = Object.fromEntries(
    SAFE_BASELINE_ENV.map((key) => [key, process.env[key]])
  );
  const previousFetch = globalThis.fetch;
  process.env.HOME = directory;
  process.env.XDG_CONFIG_HOME = directory;
  process.env.TUTURUUU_CONFIG = `${directory}/config.json`;
  process.env.TUTURUUU_DISABLE_UPDATE_CHECK = '1';
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    throw new Error(`Eval baseline refused a request to ${String(input)}`);
  }) as typeof globalThis.fetch;
  return () => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    globalThis.fetch = previousFetch;
  };
}

export interface InvokeOptions {
  api: FakeApi;
  env?: Record<string, string>;
  home: EvalHome;
  /** Runs the npm update check against the fake API instead of disabling it. */
  updateCheck?: boolean;
}

export async function invokeTtr(
  argv: string[],
  { api, env = {}, home, updateCheck = false }: InvokeOptions
): Promise<TtrInvocation> {
  const originalArgv = process.argv;
  const pending = pendingEntries();
  pending.length = 0;
  vi.resetModules();
  vi.stubEnv('TUTURUUU_CONFIG', home.configPath);
  vi.stubEnv('TUTURUUU_DISABLE_UPDATE_CHECK', updateCheck ? '' : '1');
  vi.stubEnv('TTR_RESOURCES_HOME', `${home.directory}/resources`);
  vi.stubEnv('NO_COLOR', '1');
  // Commands that read user-level state (git, agent settings) see only the
  // disposable home.
  vi.stubEnv('HOME', home.directory);
  vi.stubEnv('XDG_CONFIG_HOME', home.directory);
  vi.stubEnv('CLAUDE_CONFIG_DIR', `${home.directory}/claude`);
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.stubGlobal('fetch', api.fetch);
  process.argv = ['bun', 'ttr', ...argv];
  process.exitCode = 0;
  const output = captureOutput();
  let exitCode = 1;
  try {
    await import('../../index.js');
    await vi.waitFor(
      () => {
        if (pending.length === 0) throw new Error('ttr dispatched nothing.');
      },
      { interval: 1, timeout: 10_000 }
    );
    await Promise.allSettled(pending);
    // Let the entry's own rejection handler write stderr and the exit code.
    await new Promise<void>((resolve) => setImmediate(resolve));
  } finally {
    output.restore();
    process.argv = originalArgv;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    exitCode = Number(process.exitCode ?? 0);
    process.exitCode = 0;
  }
  const stdout = output.stdout();
  const rawStderr = output.stderr();
  const stderr = withoutRuntimeWarnings(rawStderr);
  return {
    exitCode,
    json: <T>() => JSON.parse(stdout) as T,
    leakedSecrets: findLeakedSecrets(`${stdout}\n${rawStderr}`),
    stderr,
    stdout,
  };
}
