import { z } from 'zod';
export const collaborationTicketSchema = z
  .object({
    aud: z.literal('tuturuuu.collaboration'),
    kind: z.enum(['join', 'seed', 'checkpoint', 'runner-files']),
    roomId: z.string().min(1).max(180),
    resourceId: z.guid(),
    ownerId: z.guid(),
    userId: z.guid(),
    meetingId: z.guid().optional(),
    runId: z.guid().optional(),
    runnerId: z.guid().optional(),
    resource: z.enum(['playground', 'problem']),
    role: z.enum(['owner', 'editor', 'viewer']),
    displayName: z.string().max(100),
    exp: z.number().int().positive(),
  })
  .strict();
export type CollaborationTicket = z.infer<typeof collaborationTicketSchema>;
export interface CollaborationPresence {
  userId: string;
  displayName: string;
  connectionId: string;
  file: string | null;
  cursor: { line: number; column: number } | null;
  pointer: { x: number; y: number } | null;
  selection?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  } | null;
}
export const collaborationPresenceSchema = z
  .object({
    file: z.string().max(240).nullable(),
    cursor: z
      .object({
        line: z.number().int().min(1).max(100000),
        column: z.number().int().min(1).max(100000),
      })
      .nullable(),
    selection: z
      .object({
        startLine: z.number().int().min(1).max(100000),
        startColumn: z.number().int().min(1).max(100000),
        endLine: z.number().int().min(1).max(100000),
        endColumn: z.number().int().min(1).max(100000),
      })
      .nullable()
      .optional(),
    pointer: z
      .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
      .nullable(),
  })
  .strict();
export const collaborationClientMessage = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('authenticate'), token: z.string().max(16384) })
    .strict(),
  z
    .object({ type: z.literal('update'), update: z.string().max(4_000_000) })
    .strict(),
  z
    .object({
      type: z.literal('presence'),
      presence: collaborationPresenceSchema,
    })
    .strict(),
]);

// Keep all transports on the same Yjs implementation owned by this package.
export * as Y from 'yjs';
export { ProgrammingCollaborationClient } from './client';
export {
  createProgrammingDocument,
  programmingDocumentSnapshot,
  replaceProgrammingText,
} from './document';
export { mergeRunnerFiles } from './runner-files';
