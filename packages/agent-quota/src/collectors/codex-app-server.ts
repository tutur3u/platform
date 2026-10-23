import { spawn } from 'node:child_process';
import type { UsageWindow } from '../types';
import { resetTimestamp, windowKind } from './codex-rate-limits';

interface RateLimitWindow {
  usedPercent: number;
  windowDurationMins?: number;
  resetsAt?: number | string | null;
}

interface RateLimitsResponse {
  primary?: RateLimitWindow | null;
  secondary?: RateLimitWindow | null;
}

interface JsonRpcMessage {
  id?: number;
  result?: { rateLimits?: RateLimitsResponse | null };
  error?: unknown;
}

export interface CodexAppServerOptions {
  command?: string;
  timeoutMs?: number;
  now?: () => Date;
}

function toWindows(response: RateLimitsResponse, now: Date): UsageWindow[] {
  const windows: UsageWindow[] = [];
  for (const [index, key] of (['primary', 'secondary'] as const).entries()) {
    const limit = response[key];
    if (
      !limit ||
      typeof limit.usedPercent !== 'number' ||
      !Number.isFinite(limit.usedPercent)
    )
      continue;
    windows.push({
      kind: windowKind(limit.windowDurationMins, index),
      usedPercent: Math.max(0, Math.min(100, limit.usedPercent)),
      resetsAt: resetTimestamp(limit.resetsAt),
      source: 'Codex app-server account/rateLimits/read',
      observedAt: now.toISOString(),
      authoritative: true,
    });
  }
  return windows;
}

/**
 * Reads Codex's own rate limit snapshot using its supported app-server API.
 * CODEX_HOME selects the account instance; credentials remain inside Codex.
 */
export function readCodexAppServerLimits(
  codeHome: string,
  options: CodexAppServerOptions = {}
): Promise<UsageWindow[]> {
  const timeoutMs = Math.max(250, Math.min(options.timeoutMs ?? 5000, 15000));
  const now = options.now ?? (() => new Date());
  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let requested = false;
    let child: ReturnType<typeof spawn>;
    const finish = (windows: UsageWindow[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child && child.exitCode === null) child.kill('SIGTERM');
      resolve(windows);
    };
    const timer = setTimeout(() => finish([]), timeoutMs);
    try {
      child = spawn(options.command ?? 'codex', ['app-server'], {
        cwd: codeHome,
        env: { ...process.env, CODEX_HOME: codeHome },
        stdio: ['pipe', 'pipe', 'ignore'],
      });
    } catch {
      finish([]);
      return;
    }
    if (!child.stdin || !child.stdout) {
      finish([]);
      return;
    }
    const stdin = child.stdin;
    const stdoutStream = child.stdout;
    child.on('error', () => finish([]));
    stdoutStream.setEncoding('utf8');
    const handleLine = (line: string) => {
      let message: JsonRpcMessage;
      try {
        message = JSON.parse(line) as JsonRpcMessage;
      } catch {
        return;
      }
      if (message.id === 1 && !requested) {
        requested = true;
        stdin.write('{"jsonrpc":"2.0","method":"initialized","params":{}}\n');
        stdin.write(
          '{"jsonrpc":"2.0","id":2,"method":"account/rateLimits/read","params":null}\n'
        );
        return;
      }
      if (message.id === 2)
        finish(
          message.error
            ? []
            : toWindows(message.result?.rateLimits ?? {}, now())
        );
    };
    const consumeStdout = (flush = false) => {
      let newline = stdout.indexOf('\n');
      while (newline >= 0) {
        const line = stdout.slice(0, newline).trim();
        stdout = stdout.slice(newline + 1);
        handleLine(line);
        if (settled) return;
        newline = stdout.indexOf('\n');
      }
      if (flush && stdout.trim()) {
        const line = stdout.trim();
        stdout = '';
        handleLine(line);
      }
    };
    stdin.on('error', () => finish([]));
    stdoutStream.on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 1_000_000) {
        finish([]);
        return;
      }
      consumeStdout();
    });
    child.on('close', () => {
      consumeStdout(true);
      finish([]);
    });
    stdin.write(
      '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"agent-quota","version":"1"},"capabilities":{}}}\n'
    );
  });
}
