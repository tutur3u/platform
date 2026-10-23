import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { AccountUsage, UsageWindow, WindowKind } from '../types';
import {
  type CodexAppServerOptions,
  readCodexAppServerLimits,
} from './codex-app-server';
import { resetTimestamp, windowKind } from './codex-rate-limits';
import { listJsonlFiles } from './files';
import { allowedSessionFile, codexRoot, codexRoots } from './paths';

interface LimitSample {
  usedPercent: number;
  windowMinutes?: number;
  resetsAt?: string;
  observedAt?: string;
}

function recordObjects(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== 'object') return [];
  const root = value as Record<string, unknown>;
  const payload =
    root.payload && typeof root.payload === 'object'
      ? (root.payload as Record<string, unknown>)
      : undefined;
  return [root, ...(payload ? [payload] : [])];
}

function parseLimits(line: string): {
  samples: LimitSample[];
  tokens: { input: number; output: number; observedAt: string | undefined };
} {
  const empty = {
    samples: [] as LimitSample[],
    tokens: {
      input: 0,
      output: 0,
      observedAt: undefined as string | undefined,
    },
  };
  let row: unknown;
  try {
    row = JSON.parse(line);
  } catch {
    return empty;
  }
  const rootTimestamp =
    row && typeof row === 'object'
      ? resetTimestamp((row as Record<string, unknown>).timestamp)
      : undefined;
  for (const object of recordObjects(row)) {
    const limits = object.rate_limits;
    if (!limits || typeof limits !== 'object') continue;
    const samples: LimitSample[] = [];
    for (const key of ['primary', 'secondary'] as const) {
      const item = (limits as Record<string, unknown>)[key];
      if (!item || typeof item !== 'object') continue;
      const fields = item as Record<string, unknown>;
      if (typeof fields.used_percent !== 'number') continue;
      samples.push({
        usedPercent: fields.used_percent,
        windowMinutes:
          typeof fields.window_minutes === 'number'
            ? fields.window_minutes
            : undefined,
        resetsAt: resetTimestamp(fields.resets_at),
        observedAt: resetTimestamp(object.timestamp) ?? rootTimestamp,
      });
    }
    const info =
      object.info && typeof object.info === 'object'
        ? (object.info as Record<string, unknown>)
        : {};
    const last =
      info.last_token_usage && typeof info.last_token_usage === 'object'
        ? (info.last_token_usage as Record<string, unknown>)
        : {};
    const input = typeof last.input_tokens === 'number' ? last.input_tokens : 0;
    const output =
      typeof last.output_tokens === 'number' ? last.output_tokens : 0;
    return {
      samples,
      tokens: {
        input,
        output,
        observedAt: resetTimestamp(object.timestamp) ?? rootTimestamp,
      },
    };
  }
  return empty;
}

export async function collectCodex(
  instanceId: string,
  label: string,
  roots?: string[],
  appServerOptions?: CodexAppServerOptions
): Promise<AccountUsage> {
  const defaultRoot = codexRoot(instanceId);
  const sourceRoots = roots ?? (defaultRoot ? [defaultRoot] : codexRoots());
  const appServerHome = appServerOptions
    ? (roots?.[0] ?? defaultRoot ?? sourceRoots[0])
    : roots
      ? undefined
      : (defaultRoot ?? sourceRoots[0]);
  const appServerWindows = appServerHome
    ? await readCodexAppServerLimits(appServerHome, appServerOptions)
    : [];
  const samples: LimitSample[] = [];
  let tokens = {
    input: 0,
    output: 0,
    observedAt: undefined as string | undefined,
  };
  let lastMtime = 0;
  for (const root of sourceRoots) {
    const files = await listJsonlFiles(join(root, 'sessions'));
    const valid = files.filter((file) =>
      allowedSessionFile(file, [join(root, 'sessions')])
    );
    for (const file of valid) {
      try {
        const info = await stat(file);
        if (info.mtimeMs < Date.now() - 7 * 24 * 60 * 60 * 1000) continue;
        lastMtime = Math.max(lastMtime, info.mtimeMs);
        const content = await readFile(file, 'utf8');
        for (const line of content.split('\n')) {
          const parsed = parseLimits(line);
          samples.push(...parsed.samples);
          if (
            (parsed.tokens.input || parsed.tokens.output) &&
            parsed.tokens.observedAt !== undefined &&
            (!tokens.observedAt ||
              Date.parse(parsed.tokens.observedAt) >
                Date.parse(tokens.observedAt))
          ) {
            tokens = parsed.tokens;
          }
        }
      } catch {
        /* Missing or unreadable sessions remain unknown. */
      }
    }
  }
  const latest = new Map<WindowKind, LimitSample>();
  for (const [index, sample] of samples.entries()) {
    const kind = windowKind(sample.windowMinutes, index);
    const previous = latest.get(kind);
    const sampleTime = sample.observedAt
      ? Date.parse(sample.observedAt)
      : Number.NaN;
    const previousTime = previous?.observedAt
      ? Date.parse(previous.observedAt)
      : Number.NaN;
    if (
      !previous ||
      (Number.isFinite(sampleTime) &&
        (!Number.isFinite(previousTime) || sampleTime >= previousTime))
    )
      latest.set(kind, sample);
  }
  const sessionWindows: UsageWindow[] = [...latest.entries()].map(
    ([kind, sample]) => ({
      kind,
      usedPercent: sample.usedPercent,
      resetsAt: sample.resetsAt,
      source: 'Codex local token_count rate_limits',
      observedAt: sample.observedAt ?? '',
      authoritative: sample.observedAt !== undefined,
    })
  );
  const windows = appServerWindows.length ? appServerWindows : sessionWindows;
  const observedAt = lastMtime
    ? new Date(lastMtime).toISOString()
    : new Date().toISOString();
  if (tokens.input || tokens.output)
    windows.push({
      kind: 'session',
      estimated: tokens.input + tokens.output,
      source: 'Codex local latest token increment',
      observedAt: tokens.observedAt ?? observedAt,
      authoritative: false,
    });
  return {
    instanceId,
    provider: 'codex',
    label,
    windows,
    recentTokens:
      tokens.input || tokens.output
        ? {
            ...tokens,
            observedAt: tokens.observedAt ?? observedAt,
          }
        : undefined,
  };
}
