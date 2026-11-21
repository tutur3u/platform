import { BRIDGE_LIMITS } from '@tuturuuu/utils/mastermind-store/bridge-protocol';
import { z } from 'zod';

/**
 * Response shapes of Web's owner thread routes under
 * `/api/v1/mastermind/fleet/threads` and `/replies`. Every body is parsed
 * here before it reaches a render.
 */
export const threadStates = ['running', 'waiting', 'failed', 'idle'] as const;
export type ThreadState = (typeof threadStates)[number];

const threadId = z.string().regex(/^[\w:%.][\w:%.-]{0,399}$/u);
const environmentId = z.string().min(1).max(200);
const iso = z.string().refine((value) => !Number.isNaN(Date.parse(value)));
const count = z.number().int().min(0);

export const stateCountsSchema = z.object({
  running: count,
  waiting: count,
  failed: count,
  idle: count,
});
export type StateCounts = z.infer<typeof stateCountsSchema>;

export const threadMachineSchema = z.object({
  environmentId: environmentId.optional(),
  label: z.string().max(200),
  reachable: z.boolean(),
});
export type ThreadMachine = z.infer<typeof threadMachineSchema>;
export const threadMachinesSchema = z.object({
  machines: z.array(threadMachineSchema).max(32),
});

export const threadRowSchema = z.object({
  threadId,
  title: z.string().max(2000),
  projectId: z.string().max(400).optional(),
  project: z.string().max(200).optional(),
  state: z.enum(threadStates),
  updatedAt: iso,
  itemCount: count,
  seenItemCount: count.optional(),
});
export type ThreadRow = z.infer<typeof threadRowSchema>;

export const threadPageSchema = z.object({
  threads: z.array(threadRowSchema).max(50),
  nextCursor: count.nullable(),
  total: count,
});
export type ThreadPage = z.infer<typeof threadPageSchema>;

export const projectGroupSchema = z.object({
  projectId: z.string().max(400),
  project: z.string().max(200),
  threadCount: count,
  counts: stateCountsSchema,
  latestUpdatedAt: iso,
});
export type ProjectGroup = z.infer<typeof projectGroupSchema>;

export const projectsSchema = z.object({
  projects: z.array(projectGroupSchema).max(200),
  unassigned: z.object({ threadCount: count, counts: stateCountsSchema }),
});
export type ProjectsSnapshot = z.infer<typeof projectsSchema>;

export const threadMessageSchema = z.object({
  position: count,
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  truncated: z.boolean(),
  at: iso,
});
export type ThreadMessage = z.infer<typeof threadMessageSchema>;

export const threadMessagesSchema = z.object({
  machineId: z.string().optional(),
  environmentId: environmentId.optional(),
  thread: threadRowSchema.omit({ seenItemCount: true }),
  messages: z.array(threadMessageSchema).max(100),
  earlierPosition: count.nullable(),
});
export type ThreadMessages = z.infer<typeof threadMessagesSchema>;

export const replyReceiptSchema = z.object({
  id: z.string().max(200),
  threadId,
  environmentId: environmentId.optional(),
  state: z.enum(['sent', 'delivered', 'failed', 'expired']),
  delivery: z.enum(['steered', 'started', 'queued']).optional(),
  code: z.string().max(64).optional(),
  createdAt: z.union([iso, z.number()]),
  settledAt: z.union([iso, z.number()]).optional(),
});
export type ReplyReceipt = z.infer<typeof replyReceiptSchema>;

/** Every refusal the thread routes answer, plus transport failures. */
export const threadErrorCodes = [
  'machine_offline',
  'timeout',
  'not_found',
  'mfa_required',
  'rate_limited',
  'unsupported_for_linked_machine',
  'denied',
  'invalid',
  'unavailable',
] as const;
export type ThreadErrorCode = (typeof threadErrorCodes)[number];

export type ThreadResult<T> =
  | { kind: 'ok'; data: T; fetchedAt: string }
  | { kind: 'error'; code: ThreadErrorCode };

/** `environmentId` names a linked machine; absent means the bridge machine. */
const machineInput = { environmentId: environmentId.optional() };

export const threadsInputSchema = z.object({
  ...machineInput,
  q: z.string().trim().max(100).optional(),
  cursor: count.optional(),
  limit: z.number().int().min(1).max(50).default(50),
  projectId: z.string().max(400).optional(),
  state: z.enum(threadStates).optional(),
});
export type ThreadsInput = z.input<typeof threadsInputSchema>;

export const projectsInputSchema = z.object(machineInput);

export const messagesInputSchema = z.object({
  ...machineInput,
  threadId,
  before: count.optional(),
  limit: z.number().int().min(1).max(30).default(30),
});
export type MessagesInput = z.input<typeof messagesInputSchema>;

export const replyInputSchema = z.object({
  ...machineInput,
  threadId,
  text: z.string().trim().min(1).max(BRIDGE_LIMITS.maxTextChars),
  idempotencyKey: z.uuid(),
});
export type ReplyInput = z.infer<typeof replyInputSchema>;

export const readInputSchema = z.object({
  ...machineInput,
  threadId,
  itemCount: count,
});
export type ReadInput = z.infer<typeof readInputSchema>;

export const receiptInputSchema = z.object({ id: z.string().min(1).max(200) });
