import { z } from 'zod';
export const memoryCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('settings'), enabled: z.boolean() }),
  z.object({
    action: z.literal('save'),
    content: z.string().trim().min(1).max(1000),
    category: z.enum(['preference', 'fact', 'project']),
  }),
  z.object({
    action: z.literal('edit'),
    id: z.uuid(),
    content: z.string().trim().min(1).max(1000),
  }),
  z.object({ action: z.literal('delete'), id: z.uuid() }),
]);
export type MemoryCommand = z.infer<typeof memoryCommandSchema>;
