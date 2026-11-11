import type { UIMessage } from '@tuturuuu/ai/types';
import { getToolName, isToolUIPart } from 'ai';

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

export function hasTextContent(message: UIMessage): boolean {
  return (
    message.parts?.some(
      (p) =>
        (isTextPart(p) && p.text.trim().length > 0) ||
        (isReasoningPart(p) && p.text.trim().length > 0)
    ) ?? false
  );
}

export function hasToolParts(message: UIMessage): boolean {
  return (
    message.parts?.some(
      (p) => isToolUIPart(p) && getToolName(p as never) !== 'no_action_needed'
    ) ?? false
  );
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

const FILE_ONLY_PLACEHOLDERS = new Set([
  'Please analyze the attached file(s).',
  'Please analyze the attached file(s)',
]);

export function getDisplayText(
  message: UIMessage,
  isAutoMermaidRepairPrompt: (text: string) => boolean
): string {
  const raw = getMessageText(message);
  if (FILE_ONLY_PLACEHOLDERS.has(raw.trim())) return '';
  if (isAutoMermaidRepairPrompt(raw)) return '';
  return raw;
}

export function isObjectRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
