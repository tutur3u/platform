import type { ModelMessage } from 'ai';
import { z } from 'zod';

export const AI_MESSAGE_CONTENT_MAX_CHARACTERS = 10_000;

/** The bounded column is a preview; ordered metadata retains the full reply. */
export function assistantMessageContentPreview(content: string) {
  return Array.from(content)
    .slice(0, AI_MESSAGE_CONTENT_MAX_CHARACTERS)
    .join('');
}

/** Retain generated history while keeping each model text part within its cap. */
export function normalizeAssistantModelMessages(
  messages: ModelMessage[]
): ModelMessage[] {
  return messages.map((message) => {
    if (message.role !== 'assistant') return message;
    const parts =
      typeof message.content === 'string'
        ? [{ type: 'text' as const, text: message.content }]
        : message.content;
    if (
      !parts.some(
        (part) =>
          part.type === 'text' &&
          part.text.length > AI_MESSAGE_CONTENT_MAX_CHARACTERS
      )
    ) {
      return message;
    }
    return {
      ...message,
      content: parts.flatMap<(typeof parts)[number]>((part) => {
        if (
          part.type !== 'text' ||
          part.text.length <= AI_MESSAGE_CONTENT_MAX_CHARACTERS
        )
          return [part];
        const chunks: (typeof part)[] = [];
        for (let start = 0; start < part.text.length; ) {
          let end = Math.min(
            start + AI_MESSAGE_CONTENT_MAX_CHARACTERS,
            part.text.length
          );
          const last = part.text.charCodeAt(end - 1);
          if (end < part.text.length && last >= 0xd800 && last <= 0xdbff) end--;
          chunks.push({ ...part, text: part.text.slice(start, end) });
          start = end;
        }
        return chunks;
      }),
    };
  });
}

const overflowMetadataSchema = z.object({
  ai: z.object({
    contentTruncated: z.literal(true),
    parts: z.array(z.unknown()),
  }),
});
const textPartSchema = z.object({ type: z.literal('text'), text: z.string() });
const persistedMetadataSchema = z.union([
  z
    .object({ source: z.literal('ai-chat'), metadata: overflowMetadataSchema })
    .transform(({ metadata }) => metadata),
  overflowMetadataSchema,
]);

export function restoreAssistantMessageContent(
  content: string | null,
  metadata: unknown
): string {
  const parsed = persistedMetadataSchema.safeParse(metadata);
  if (!parsed.success) return content ?? '';
  const texts = parsed.data.ai.parts.flatMap((part) => {
    const text = textPartSchema.safeParse(part);
    return text.success ? [text.data.text] : [];
  });
  return texts.length ? texts.join('\n\n') : (content ?? '');
}
