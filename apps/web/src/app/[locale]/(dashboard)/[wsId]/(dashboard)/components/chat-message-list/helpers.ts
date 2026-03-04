import type { UIMessage } from '@tuturuuu/ai/types';
import { getToolName, isToolUIPart } from 'ai';
import type { MessageFileAttachment } from '../file-preview-chips';

function isTextPart(part: unknown): part is { type: 'text'; text: string } {
  return (
    typeof part === 'object' &&
    part !== null &&
    (part as { type?: unknown }).type === 'text' &&
    typeof (part as { text?: unknown }).text === 'string'
  );
}

function isReasoningPart(
  part: unknown
): part is { type: 'reasoning'; text: string } {
  return (
    typeof part === 'object' &&
    part !== null &&
    (part as { type?: unknown }).type === 'reasoning' &&
    typeof (part as { text?: unknown }).text === 'string'
  );
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown Mermaid parse error';
  }
}

const LEADING_ASSISTANT_META_TOOL_CALL_PATTERN =
  /^\s*(?:`{1,3})?(?:select_tools|no_action_needed)\([^)\n]*\)(?:`{1,3})?\s*(?:\n+|$)/;
const LEADING_ASSISTANT_META_TOOL_JSON_PATTERN =
  /^\s*(?:`{1,3})?\{\s*"tools"\s*:\s*\[(?:\s*"[^"]+"\s*,?)*\]\s*\}(?:`{1,3})?\s*(?:\n+|$)/;

export function hasTextContent(message: UIMessage): boolean {
  return (
    message.parts?.some(
      (p) =>
        (isTextPart(p) && p.text.trim().length > 0) ||
        (isReasoningPart(p) && p.text.trim().length > 0)
    ) ?? false
  );
}

export function hasReasoningContent(message: UIMessage): boolean {
  return (
    message.parts?.some(
      (part) => isReasoningPart(part) && part.text.trim().length > 0
    ) ?? false
  );
}

export function hasToolParts(message: UIMessage): boolean {
  return message.parts?.some((p) => shouldRenderToolPart(p)) ?? false;
}

export function hasVisualToolPart(message: UIMessage): boolean {
  return (
    message.parts?.some((part) => {
      if (!isToolUIPart(part as never)) return false;
      return getToolName(part as never) === 'render_ui';
    }) ?? false
  );
}

export function isNoActionSelectToolsPart(part: unknown): boolean {
  if (!isToolUIPart(part as never)) return false;
  if (getToolName(part as never) !== 'select_tools') return false;

  const output = (part as { output?: unknown }).output;
  if (!isObjectRecord(output)) return false;

  const selectedTools = output.selectedTools;
  return (
    Array.isArray(selectedTools) &&
    selectedTools.length === 1 &&
    selectedTools[0] === 'no_action_needed'
  );
}

export function shouldRenderToolPart(part: unknown): boolean {
  if (!isToolUIPart(part as never)) return false;

  const toolName = getToolName(part as never);
  if (toolName === 'no_action_needed') return false;
  if (toolName === 'select_tools') return false;
  return true;
}

export function hasOutputText(message: UIMessage): boolean {
  return (
    message.parts?.some((p) => isTextPart(p) && p.text.trim().length > 0) ??
    false
  );
}

export function humanizeToolName(name: string): string {
  const words = name.replace(/[-_]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function getMessageText(message: UIMessage): string {
  return (
    message.parts
      ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('') || ''
  );
}

export function stripLeadingAssistantMetaToolCall(text: string): string {
  let next = text;

  while (
    LEADING_ASSISTANT_META_TOOL_CALL_PATTERN.test(next) ||
    LEADING_ASSISTANT_META_TOOL_JSON_PATTERN.test(next)
  ) {
    next = next
      .replace(LEADING_ASSISTANT_META_TOOL_CALL_PATTERN, '')
      .replace(LEADING_ASSISTANT_META_TOOL_JSON_PATTERN, '');
  }

  return next.trimStart();
}

export function getAssistantDisplayText(message: UIMessage): string {
  return stripLeadingAssistantMetaToolCall(getMessageText(message));
}

const FILE_ONLY_PLACEHOLDERS = new Set([
  'Please analyze the attached file(s).',
  'Please analyze the attached file(s)',
]);

function isLegacyAttachmentSummary(text: string): boolean {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    lines.length > 0 && lines.every((line) => /^\[File:\s.+\]$/.test(line))
  );
}

export function getDisplayText(
  message: UIMessage,
  isAutoMermaidRepairPrompt: (text: string) => boolean
): string {
  const raw = getMessageText(message);
  const trimmed = raw.trim();
  if (
    FILE_ONLY_PLACEHOLDERS.has(trimmed) ||
    isLegacyAttachmentSummary(trimmed)
  ) {
    return '';
  }
  if (isAutoMermaidRepairPrompt(raw)) return '';
  return raw;
}

export function isObjectRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getRenderableMessageAttachments(
  message: UIMessage,
  messageAttachments?: Map<string, MessageFileAttachment[]>
): MessageFileAttachment[] {
  const directAttachments = dedupeRenderableAttachments(
    messageAttachments?.get(message.id) ?? []
  );
  const metadataAttachments = normalizeMessageMetadataAttachments(message);

  if (metadataAttachments.length === 0) {
    return directAttachments;
  }

  if (directAttachments.length === 0) {
    return metadataAttachments;
  }

  const attachmentsByKey = new Map<string, MessageFileAttachment>();

  for (const attachment of directAttachments) {
    attachmentsByKey.set(attachment.storagePath || attachment.name, attachment);
  }

  for (const attachment of metadataAttachments) {
    const key = attachment.storagePath || attachment.name;
    const existing = attachmentsByKey.get(key);
    if (!existing) {
      attachmentsByKey.set(key, attachment);
      continue;
    }

    attachmentsByKey.set(key, {
      ...existing,
      alias: attachment.alias ?? existing.alias ?? null,
      type:
        existing.type !== 'application/octet-stream'
          ? existing.type
          : attachment.type,
    });
  }

  return [...attachmentsByKey.values()];
}

function dedupeRenderableAttachments(
  attachments: MessageFileAttachment[]
): MessageFileAttachment[] {
  const attachmentsByKey = new Map<string, MessageFileAttachment>();

  for (const attachment of attachments) {
    const key = attachment.storagePath || attachment.name;
    const existing = attachmentsByKey.get(key);

    if (!existing) {
      attachmentsByKey.set(key, attachment);
      continue;
    }

    attachmentsByKey.set(key, {
      ...existing,
      alias: attachment.alias ?? existing.alias ?? null,
      previewUrl: existing.previewUrl ?? attachment.previewUrl,
      signedUrl: existing.signedUrl ?? attachment.signedUrl,
      storagePath: existing.storagePath ?? attachment.storagePath,
      type:
        existing.type !== 'application/octet-stream'
          ? existing.type
          : attachment.type,
    });
  }

  return [...attachmentsByKey.values()];
}

function normalizeMessageMetadataAttachments(
  message: UIMessage
): MessageFileAttachment[] {
  if (!isObjectRecord(message.metadata)) return [];

  const rawAttachments = message.metadata.attachments;
  if (!Array.isArray(rawAttachments)) return [];

  const normalized: MessageFileAttachment[] = [];

  rawAttachments.forEach((entry, index) => {
    if (!isObjectRecord(entry)) return;

    const storagePath =
      typeof entry.storagePath === 'string' ? entry.storagePath.trim() : '';
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';

    if (!storagePath || !name) return;

    normalized.push({
      alias:
        typeof entry.alias === 'string' && entry.alias.trim().length > 0
          ? entry.alias.trim()
          : null,
      id: `metadata-${message.id}-${index}`,
      name,
      previewUrl: null,
      signedUrl: null,
      size:
        typeof entry.size === 'number' && Number.isFinite(entry.size)
          ? Math.max(0, Math.floor(entry.size))
          : 0,
      storagePath,
      type:
        typeof entry.type === 'string' && entry.type.trim().length > 0
          ? entry.type.trim()
          : 'application/octet-stream',
    });
  });

  return normalized;
}
