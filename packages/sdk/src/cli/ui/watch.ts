import { CLI_EXIT, CliError, type WatchTickContext } from '../cli-contracts';
import { escapeTerminalText } from '../select';
import { createTheme } from './theme';

const MIN_WATCH_SECONDS = 10;
const MAX_WATCH_SECONDS = 3600;

export interface RunWatchLoopOptions<T> {
  fetch: (ctx: WatchTickContext) => Promise<T>;
  intervalSeconds: number;
  isTTY?: boolean;
  json?: boolean;
  jsonl?: boolean;
  maxIterations?: number;
  renderHuman: (data: T, ctx: WatchTickContext) => string;
  signal?: AbortSignal;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  title?: string;
  write?: (chunk: string) => void;
}

function invalidWatchInterval(raw: unknown): CliError {
  return new CliError({
    code: 'INVALID_WATCH_INTERVAL',
    exitCode: CLI_EXIT.usage,
    hint: 'Pass an integer number of seconds from 10 to 3600.',
    message: `Invalid watch interval "${String(raw)}". Expected an integer from 10 to 3600.`,
  });
}

function assertInterval(value: number, raw: unknown): number {
  if (
    !Number.isInteger(value) ||
    value < MIN_WATCH_SECONDS ||
    value > MAX_WATCH_SECONDS
  ) {
    throw invalidWatchInterval(raw);
  }
  return value;
}

export function parseWatchInterval(
  raw?: string | boolean,
  defaultSeconds = MIN_WATCH_SECONDS
): number {
  if (!raw) return 0;
  if (raw === true) return assertInterval(defaultSeconds, defaultSeconds);
  const trimmed = raw.trim();
  if (!/^[0-9]+$/.test(trimmed)) throw invalidWatchInterval(raw);
  return assertInterval(Number(trimmed), trimmed);
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (timer !== undefined) clearTimeout(timer);
      resolve();
    };
    timer = setTimeout(() => {
      signal.removeEventListener('abort', finish);
      resolve();
    }, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
}

function backoffMs(
  intervalSeconds: number,
  consecutiveFailures: number
): number {
  const base = Math.max(1, intervalSeconds) * 1000;
  const shift = Math.min(Math.max(0, consecutiveFailures - 1), 5);
  return Math.min(base * 2 ** shift, 30_000);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function bindAbort(signal: AbortSignal | undefined): {
  dispose: () => void;
  signal: AbortSignal;
} {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', abort, { once: true });
  }
  process.on('SIGINT', abort);
  return {
    dispose: () => {
      process.off('SIGINT', abort);
      signal?.removeEventListener('abort', abort);
    },
    signal: controller.signal,
  };
}

export async function runWatchLoop<T>(
  options: RunWatchLoopOptions<T>
): Promise<void> {
  const binding = bindAbort(options.signal);
  const signal = binding.signal;
  const write =
    options.write ??
    ((chunk: string) => {
      process.stdout.write(chunk);
    });
  const sleep = options.sleep ?? delay;
  const tty = options.isTTY ?? Boolean(process.stdout.isTTY);
  const machine = options.json === true || options.jsonl === true;
  const theme = createTheme({ isTTY: tty });
  const title = options.title ?? 'watch';
  let attempt = 0;
  let consecutiveFailures = 0;

  try {
    while (!signal.aborted) {
      if (
        options.maxIterations !== undefined &&
        attempt >= options.maxIterations
      ) {
        return;
      }

      attempt += 1;
      const ctx: WatchTickContext = {
        attempt,
        observedAt: new Date().toISOString(),
        signal,
      };

      let data: T;
      try {
        data = await options.fetch(ctx);
      } catch (error) {
        if (signal.aborted || isAbortError(error)) return;
        consecutiveFailures += 1;
        if (!machine) {
          const message =
            error instanceof Error ? error.message : String(error);
          write(
            `${theme.warn(`temporary error (${consecutiveFailures}/3): ${escapeTerminalText(message)}`)}\n`
          );
        }
        if (consecutiveFailures >= 3) throw error;
        await sleep(
          backoffMs(options.intervalSeconds, consecutiveFailures),
          signal
        );
        continue;
      }

      if (signal.aborted) return;
      consecutiveFailures = 0;

      if (machine) {
        write(
          `${JSON.stringify({
            observedAt: ctx.observedAt,
            attempt: ctx.attempt,
            data,
          })}\n`
        );
      } else if (tty) {
        const body = options.renderHuman(data, ctx);
        write(
          `\u001B[2J\u001B[H${theme.bold(title)}  ${theme.dim(`#${ctx.attempt}`)}  ${theme.dim(ctx.observedAt)}  ${theme.dim(`every ${options.intervalSeconds}s`)}\n${theme.dim('─'.repeat(40))}\n${body.endsWith('\n') ? body : `${body}\n`}`
        );
      } else {
        const body = options.renderHuman(data, ctx);
        write(body.endsWith('\n') ? body : `${body}\n`);
      }

      if (
        options.maxIterations !== undefined &&
        attempt >= options.maxIterations
      ) {
        return;
      }

      await sleep(Math.max(0, options.intervalSeconds) * 1000, signal);
    }
  } finally {
    binding.dispose();
  }
}
