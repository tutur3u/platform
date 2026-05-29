import {
  type AiMessagePart,
  formatJson,
  readString,
  readToolNameFromType,
} from './ai-message-render-utils';

export function isAiToolPart(part: AiMessagePart) {
  const type = readString(part.type);
  return type === 'dynamic-tool' || Boolean(type?.startsWith('tool-'));
}

export function dedupeToolParts(parts: AiMessagePart[]) {
  const next: AiMessagePart[] = [];
  const indexByKey = new Map<string, number>();

  for (const part of parts) {
    const key = getToolPartIdentity(part);
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, next.length);
      next.push(part);
      continue;
    }

    next[existingIndex] = mergeToolParts(next[existingIndex]!, part);
  }

  return next;
}

export function summarizeToolParts(
  parts: AiMessagePart[],
  isStreaming: boolean
) {
  let successCount = 0;
  let failedCount = 0;
  let runningCount = 0;

  for (const part of parts) {
    const { isError, isRunning } = getToolPartStatus(part, isStreaming);
    if (isRunning) {
      runningCount += 1;
    } else if (isError) {
      failedCount += 1;
    } else {
      successCount += 1;
    }
  }

  return {
    failedCount,
    latestToolName: readToolName(parts.at(-1)),
    runningCount,
    successCount,
  };
}

export function getToolPartStatus(part: AiMessagePart, isStreaming: boolean) {
  const state = readString(part.state);
  const hasOutput = part.output !== undefined || part.errorText !== undefined;
  const isError =
    state === 'output-error' ||
    state === 'output-denied' ||
    Boolean(readString(part.errorText)) ||
    hasLogicalToolError(part.output);
  const isRunning = isStreaming
    ? state
      ? !['output-available', 'output-error', 'output-denied'].includes(state)
      : !hasOutput
    : false;

  return { isError, isRunning };
}

export function getToolPartKey(part: AiMessagePart, index: number) {
  return `${getToolPartIdentity(part)}:${index}`;
}

export function readToolName(part: AiMessagePart | undefined) {
  if (!part) return null;
  return readString(part.toolName) ?? readToolNameFromType(part);
}

export function readSelectedTools(output: unknown) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return [];
  }

  const selectedTools = (output as { selectedTools?: unknown }).selectedTools;
  return Array.isArray(selectedTools)
    ? selectedTools.filter(
        (tool): tool is string => typeof tool === 'string' && tool.trim() !== ''
      )
    : [];
}

function mergeToolParts(existing: AiMessagePart, incoming: AiMessagePart) {
  return {
    ...existing,
    ...incoming,
    errorText: incoming.errorText ?? existing.errorText,
    input: incoming.input ?? existing.input,
    output: incoming.output ?? existing.output,
    toolName: incoming.toolName ?? existing.toolName,
  };
}

function getToolPartIdentity(part: AiMessagePart) {
  const toolName = readToolName(part);
  const selectedTools = readSelectedTools(part.output);

  if (toolName === 'select_tools' && selectedTools.length > 0) {
    return `select_tools:${selectedTools.join('|')}`;
  }

  return (
    readString(part.toolCallId) ??
    readString(part.id) ??
    readString(part.key) ??
    `${readString(part.type) ?? 'tool'}:${toolName ?? 'tool'}:${formatJson(
      part.input
    )}:${formatJson(part.output)}`
  );
}

function hasLogicalToolError(output: unknown) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return false;
  }

  const record = output as Record<string, unknown>;
  return (
    record.ok === false ||
    record.success === false ||
    typeof record.error === 'string'
  );
}
