import { readFile, stat } from 'node:fs/promises';
import type { AccountUsage, UsageWindow, WindowKind } from '../types';
import { listJsonlFiles } from './files';
import { claudeProjectsRoot } from './paths';

interface TokenTotals {
  input: number;
  output: number;
  observedAt: string;
}

function readUsage(
  line: string,
  fallbackObservedAt: string
): TokenTotals | undefined {
  try {
    const row: unknown = JSON.parse(line);
    if (!row || typeof row !== 'object') return;
    const root = row as Record<string, unknown>;
    const message =
      root.message && typeof root.message === 'object'
        ? (root.message as Record<string, unknown>)
        : {};
    const usage =
      message.usage && typeof message.usage === 'object'
        ? (message.usage as Record<string, unknown>)
        : {};
    const input =
      typeof usage.input_tokens === 'number' ? usage.input_tokens : 0;
    const output =
      typeof usage.output_tokens === 'number' ? usage.output_tokens : 0;
    if (!input && !output) return;
    return {
      input,
      output,
      observedAt:
        typeof root.timestamp === 'string'
          ? root.timestamp
          : fallbackObservedAt,
    };
  } catch {
    return;
  }
}

interface ClaudeRateLimitSample {
  id: string;
  kind: WindowKind;
  usedPercent: number;
  resetsAt?: string;
  observedAt: string;
}

function readRateLimitEvent(
  line: string,
  fallbackObservedAt: string
): ClaudeRateLimitSample | undefined {
  try {
    const row: unknown = JSON.parse(line);
    if (!row || typeof row !== 'object') return;
    const root = row as Record<string, unknown>;
    if (root.type !== 'rate_limit_event') return;
    const info =
      root.rate_limit_info && typeof root.rate_limit_info === 'object'
        ? (root.rate_limit_info as Record<string, unknown>)
        : {};
    const rateLimitType = info.rateLimitType;
    const utilization = info.utilization;
    if (
      typeof rateLimitType !== 'string' ||
      typeof utilization !== 'number' ||
      !Number.isFinite(utilization)
    )
      return;
    const type = rateLimitType.toLowerCase();
    const kind: WindowKind = type === 'five_hour' ? 'short' : 'long';
    let resetsAt: string | undefined;
    if (typeof info.resetsAt === 'number' && Number.isFinite(info.resetsAt)) {
      const date = new Date(info.resetsAt * 1000);
      if (!Number.isNaN(date.getTime())) resetsAt = date.toISOString();
    }
    const observedAt =
      typeof root.timestamp === 'string' ? root.timestamp : fallbackObservedAt;
    const observedMs = Date.parse(observedAt);
    const resetMs = resetsAt ? Date.parse(resetsAt) : Number.NaN;
    const durationMs =
      type === 'five_hour' ? 5 * 60 * 60_000 : 7 * 24 * 60 * 60_000;
    const now = Date.now();
    if (
      !Number.isFinite(observedMs) ||
      observedMs > now + 5 * 60_000 ||
      (Number.isFinite(resetMs) && resetMs <= now) ||
      (!Number.isFinite(resetMs) && now - observedMs > durationMs)
    )
      return;
    return {
      id: rateLimitType,
      kind,
      usedPercent: Math.max(0, Math.min(100, utilization * 100)),
      resetsAt,
      observedAt,
    };
  } catch {
    return;
  }
}

export async function collectClaude(
  instanceId: string,
  label: string,
  projectsRoot = claudeProjectsRoot(instanceId)
): Promise<AccountUsage> {
  if (!projectsRoot)
    return {
      instanceId,
      provider: 'claude',
      label,
      windows: [],
      lastError: 'No allowlisted instance directory',
    };
  const tokens = { input: 0, output: 0 };
  let lastMtime = 0;
  let latestUsageAt = 0;
  const now = Date.now();
  const cutoff = now - 24 * 60 * 60 * 1000;
  const limits = new Map<string, ClaudeRateLimitSample>();
  const windows: UsageWindow[] = [];
  for (const file of await listJsonlFiles(projectsRoot)) {
    try {
      const info = await stat(file);
      if (info.mtimeMs < Date.now() - 24 * 60 * 60 * 1000) continue;
      lastMtime = Math.max(lastMtime, info.mtimeMs);
      const content = await readFile(file, 'utf8');
      for (const line of content.split('\n')) {
        const usage = readUsage(line, info.mtime.toISOString());
        if (usage) {
          const timestamp = Date.parse(usage.observedAt);
          if (
            !Number.isFinite(timestamp) ||
            timestamp < cutoff ||
            timestamp > now + 5 * 60_000
          )
            continue;
          tokens.input += usage.input;
          tokens.output += usage.output;
          latestUsageAt = Math.max(latestUsageAt, timestamp);
        }
        const limit = readRateLimitEvent(line, '');
        if (limit) {
          const previous = limits.get(limit.id);
          if (
            !previous ||
            Date.parse(limit.observedAt) > Date.parse(previous.observedAt)
          )
            limits.set(limit.id, limit);
        }
      }
    } catch {
      /* Missing or unreadable transcripts remain unknown. */
    }
  }
  const observedAt = latestUsageAt
    ? new Date(latestUsageAt).toISOString()
    : lastMtime
      ? new Date(lastMtime).toISOString()
      : new Date().toISOString();
  if (tokens.input || tokens.output) {
    windows.push({
      kind: 'session',
      estimated: tokens.input + tokens.output,
      source: 'Claude Code local transcript usage (last 24h)',
      observedAt,
      authoritative: false,
    });
  }
  windows.push(
    ...[...limits.values()].map((limit) => ({
      kind: limit.kind,
      usedPercent: limit.usedPercent,
      resetsAt: limit.resetsAt,
      source: `Claude Code rate_limit_event (${limit.id})`,
      observedAt: limit.observedAt,
      authoritative: true,
    }))
  );
  return {
    instanceId,
    provider: 'claude',
    label,
    windows,
    recentTokens:
      tokens.input || tokens.output ? { ...tokens, observedAt } : undefined,
  };
}
