import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import type { UIMessage } from 'ai';
import { z } from 'zod';

const ChatRoleSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.toLowerCase())
  .pipe(z.enum(['assistant', 'system', 'user']));

const UIMessagePartSchema = z
  .object({
    type: z.string().trim().min(1),
  })
  .catchall(z.unknown());

const UIMessageSchema = z
  .object({
    id: z.string().optional(),
    role: ChatRoleSchema,
    parts: z.array(UIMessagePartSchema),
    name: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const ChatRequestBodySchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  messages: z.array(UIMessageSchema).optional(),
  wsId: z.string().optional(),
  workspaceContextId: z.string().optional(),
  isMiraMode: z.boolean().optional(),
  timezone: z.string().optional(),
  thinkingMode: z.enum(['thinking', 'fast']).optional(),
  creditSource: z.enum(['personal', 'workspace']).optional(),
  creditWsId: z.string().uuid().optional(),
});

export type ChatRequestBody = z.infer<typeof ChatRequestBodySchema>;

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function mapToUIMessageParts(
  parts: z.infer<typeof UIMessageSchema>['parts']
): UIMessage['parts'] {
  const mappedParts: UIMessage['parts'] = [];

  for (const rawPart of parts) {
    const part = UIMessagePartSchema.parse(rawPart);

    if (part.type === 'text' && typeof part.text === 'string') {
      mappedParts.push({ type: 'text', text: part.text });
      continue;
    }

    if (part.type === 'reasoning' && typeof part.text === 'string') {
      mappedParts.push({ type: 'reasoning', text: part.text });
      continue;
    }

    if (part.type === 'step-start') {
      mappedParts.push({ type: 'step-start' as const });
      continue;
    }

    if (
      part.type === 'dynamic-tool' &&
      typeof part.toolName === 'string' &&
      typeof part.toolCallId === 'string'
    ) {
      mappedParts.push({
        type: 'dynamic-tool' as const,
        toolName: part.toolName,
        toolCallId: part.toolCallId,
        state: 'output-available' as const,
        input: part.input ?? {},
        output: part.output ?? null,
        ...(typeof part.title === 'string' ? { title: part.title } : {}),
        ...(typeof part.providerExecuted === 'boolean'
          ? { providerExecuted: part.providerExecuted }
          : {}),
        ...(part.callProviderMetadata !== undefined
          ? {
              callProviderMetadata: part.callProviderMetadata as NonNullable<
                UIMessage['parts'][number] & {
                  type: 'dynamic-tool';
                  state: 'output-available';
                }
              >['callProviderMetadata'],
            }
          : {}),
        ...(typeof part.preliminary === 'boolean'
          ? { preliminary: part.preliminary }
          : {}),
      });
      continue;
    }

    if (
      part.type === 'source-url' &&
      typeof part.sourceId === 'string' &&
      typeof part.url === 'string' &&
      isValidHttpUrl(part.url)
    ) {
      mappedParts.push({
        type: 'source-url' as const,
        sourceId: part.sourceId,
        url: part.url,
        ...(typeof part.title === 'string' ? { title: part.title } : {}),
      } as UIMessage['parts'][number]);
    }
  }

  return mappedParts;
}

export function mapToUIMessages(
  messages: ChatRequestBody['messages']
): UIMessage[] {
  if (!messages) return [];

  return messages.map(
    (message): UIMessage => ({
      id: message.id ?? generateRandomUUID(),
      role: message.role,
      parts: mapToUIMessageParts(message.parts),
      ...(message.name ? { name: message.name } : {}),
      ...(message.metadata ? { metadata: message.metadata } : {}),
    })
  );
}
