import { getToolName, isToolUIPart } from 'ai';

export function getMiraToolName(part: unknown): string {
  if (!part || typeof part !== 'object') {
    return '';
  }

  if (isToolUIPart(part as never)) {
    return getToolName(part as never);
  }

  const toolInvocation = (part as { toolInvocation?: { toolName?: unknown } })
    .toolInvocation;
  if (typeof toolInvocation?.toolName === 'string') {
    const trimmed = toolInvocation.toolName.trim();
    if (trimmed.length > 0) return trimmed;
  }

  const toolName = (part as { toolName?: unknown }).toolName;
  if (typeof toolName === 'string') {
    const trimmed = toolName.trim();
    if (trimmed.length > 0) return trimmed;
  }

  const type = (part as { type?: unknown }).type;
  if (typeof type === 'string' && type.startsWith('tool-')) {
    return type.slice('tool-'.length);
  }

  return '';
}

export function getMiraToolCallId(
  part: unknown,
  fallback: string | number
): string | number {
  if (!part || typeof part !== 'object') {
    return fallback;
  }

  const toolInvocation = (
    part as {
      toolInvocation?: { toolCallId?: unknown };
    }
  ).toolInvocation;
  if (
    typeof toolInvocation?.toolCallId === 'string' &&
    toolInvocation.toolCallId.trim().length > 0
  ) {
    return toolInvocation.toolCallId.trim();
  }

  const toolCallId = (part as { toolCallId?: unknown }).toolCallId;
  if (typeof toolCallId === 'string' && toolCallId.trim().length > 0) {
    return toolCallId.trim();
  }

  const id = (part as { id?: unknown }).id;
  if (typeof id === 'string' && id.trim().length > 0) {
    return id.trim();
  }

  return fallback;
}
