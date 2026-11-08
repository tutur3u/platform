import { z } from 'zod';

export const MindChatBodySchema = z.object({
  boardId: z.guid().nullable().optional(),
  clientRunId: z.string().trim().min(1).max(120).optional(),
  creditSource: z.enum(['personal', 'workspace']).optional(),
  creditWsId: z.string().optional(),
  messages: z.array(z.unknown()).optional(),
  model: z.string().optional(),
  thinkingMode: z.enum(['fast', 'thinking']).optional(),
  threadId: z.guid().optional(),
  timezone: z.string().optional(),
  writeMode: z.enum(['direct', 'review']).optional(),
  wsId: z.string().min(1),
});
