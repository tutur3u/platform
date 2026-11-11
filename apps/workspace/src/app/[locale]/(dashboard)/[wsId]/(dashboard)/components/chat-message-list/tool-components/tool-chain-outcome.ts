import { getMiraToolName } from '../../mira-tool-part-utils';
import type { ToolPartData } from '../types';
import { getToolPartStatus } from './tool-status';

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function retryKey(part: ToolPartData): string | null {
  const name = getMiraToolName(part);
  let input: unknown = part.input;
  if (input === undefined && 'rawInput' in part) {
    try {
      input =
        typeof part.rawInput === 'string'
          ? JSON.parse(part.rawInput)
          : part.rawInput;
    } catch {
      return null;
    }
  }
  // Never infer recovery from assistant prose, tool name alone, or missing input.
  if (!name || input === undefined || input === null) return null;
  return `${name}:${canonicalize(input)}`;
}

/** Derived from ordered persisted parts; original failures remain in history. */
export function getToolChainOutcome(parts: ToolPartData[], history = parts) {
  const recovered = new Set<ToolPartData>();
  const successful = new Set<string>();
  let failedCount = 0;
  let running = false;
  const included = new Set(parts);
  for (const part of [...history].reverse()) {
    const status = getToolPartStatus(part);
    const key = retryKey(part);
    if (status.isRunning && included.has(part)) running = true;
    if (status.isError) {
      if (included.has(part)) {
        if (key && successful.has(key)) recovered.add(part);
        else failedCount += 1;
      }
    } else if (status.isDone && key) {
      successful.add(key);
    }
  }
  return {
    recovered,
    failedCount,
    status: running
      ? 'running'
      : failedCount > 0
        ? 'error'
        : recovered.size > 0
          ? 'recovered'
          : 'done',
  } as const;
}
