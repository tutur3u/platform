import { MAX_ID_LENGTH } from '@tuturuuu/utils/constants';
import { generateRandomUUID } from '@tuturuuu/utils/uuid-helper';
import type { UIMessage } from 'ai';
import { z } from 'zod';
import { miraClientCapabilitiesInputSchema } from '../../tools/mira-client-capabilities';

const ChatRoleSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.toLowerCase())
  .pipe(z.enum(['assistant', 'user']));

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

const TaskBoardContextListSchema = z.object({
  id: z.string().trim().min(1).max(MAX_ID_LENGTH),
  name: z.string().trim().min(1).max(120).nullable().optional(),
  status: z.string().trim().min(1).max(80).nullable().optional(),
  position: z.number().nullable().optional(),
});

const TaskBoardContextSchema = z.object({
  workspaceId: z.string().trim().min(1).max(MAX_ID_LENGTH).optional(),
  workspaceName: z.string().trim().min(1).max(160).optional(),
  boardId: z.string().trim().min(1).max(MAX_ID_LENGTH),
  boardName: z.string().trim().min(1).max(160).optional(),
  selectedList: TaskBoardContextListSchema.nullable().optional(),
  lists: z.array(TaskBoardContextListSchema).max(80).default([]),
});

const ChatIdSchema = z.string().trim().pipe(z.uuid());

export const ChatRequestBodySchema = z.object({
  id: ChatIdSchema.optional(),
  model: z.string().optional(),
  messages: z.array(UIMessageSchema).optional(),
  wsId: z.string().optional(),
  workspaceContextId: z.string().optional(),
  isMiraMode: z.boolean().optional(),
  timezone: z.string().optional(),
  thinkingMode: z.enum(['thinking', 'fast']).optional(),
  creditSource: z.enum(['personal', 'workspace']).optional(),
  creditWsId: z.string().trim().min(1).max(MAX_ID_LENGTH).optional(),
  observabilityContext: z.array(z.record(z.string(), z.unknown())).optional(),
  persistenceRequestId: z.string().trim().uuid().optional(),
  taskBoardContext: TaskBoardContextSchema.optional(),
  clientCapabilities: miraClientCapabilitiesInputSchema.optional(),
});

export type ChatRequestBody = z.infer<typeof ChatRequestBodySchema>;
export type ChatRequestTaskBoardContext = z.infer<
  typeof TaskBoardContextSchema
>;

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function mapToUIMessageParts(
  parts: z.infer<typeof UIMessageSchema>['parts'],
  role: z.infer<typeof ChatRoleSchema>
): UIMessage['parts'] {
  const mappedParts: UIMessage['parts'] = [];

  for (const rawPart of parts) {
    const part = UIMessagePartSchema.parse(rawPart);

    if (part.type === 'text' && typeof part.text === 'string') {
      mappedParts.push({ type: 'text', text: part.text });
      continue;
    }

    if (role === 'assistant') continue;

    if (
      part.type === 'source-url' &&
      typeof part.sourceId === 'string' &&
      typeof part.url === 'string' &&
      isValidHttpUrl(part.url)
    ) {
      mappedParts.push({
        type: 'text',
        text: `Source: ${
          typeof part.title === 'string' ? `${part.title} ` : ''
        }${part.url}`,
      });
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
      parts: mapToUIMessageParts(message.parts, message.role),
      ...(message.name ? { name: message.name } : {}),
      ...(message.metadata ? { metadata: message.metadata } : {}),
    })
  );
}
