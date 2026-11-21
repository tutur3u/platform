import {
  FLEET_REPLY_MAX_CHARS,
  type FleetThread,
  type FleetThreadMachines,
  type FleetThreadMessage,
  type FleetThreadMessages,
  type FleetThreadPage,
  type FleetThreadProjects,
  fleetThreadStates,
} from '@tuturuuu/internal-api/mastermind-threads';
import { z } from 'zod';

/**
 * The Projects page reads the shapes of
 * `@tuturuuu/internal-api/mastermind-threads`, which parses every Web answer.
 * This module names them for the page and validates what the page sends to
 * its own server functions.
 */
export const threadStates = fleetThreadStates;
export type ThreadState = (typeof threadStates)[number];

export type ThreadRow = FleetThread;
/** A list page; `cachedAt` marks one read from the browser cache. */
export type ThreadPage = FleetThreadPage & { cachedAt?: string };
export type ProjectsSnapshot = FleetThreadProjects;
export type StateCounts = ProjectsSnapshot['unassigned']['counts'];
export type ThreadMachine = FleetThreadMachines['machines'][number];
export type ThreadMessage = FleetThreadMessage;
export type ThreadMessages = FleetThreadMessages;

/** The machines one bridge machine reaches, and who is asking. */
export type ThreadContext = FleetThreadMachines & {
  /** The signed-in owner's id; the browser cache keys its lists by it. */
  ownerId: string;
};

/** Every refusal the page shows; anything unknown reads as `unavailable`. */
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
  | { kind: 'error'; code: ThreadErrorCode; ownerId?: string };

const threadId = z.string().regex(/^[\w:%.][\w:%.-]{0,399}$/u);
const environmentId = z.string().regex(/^\w[\w-]{0,99}$/u);
const count = z.number().int().min(0);
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

export const readInputSchema = z.object({
  ...machineInput,
  threadId,
  itemCount: count,
});
export type ReadInput = z.infer<typeof readInputSchema>;

export const replyInputSchema = z.object({
  ...machineInput,
  threadId,
  text: z.string().trim().min(1).max(FLEET_REPLY_MAX_CHARS),
  idempotencyKey: z.uuid(),
});
export type ReplyInput = z.infer<typeof replyInputSchema>;

export const receiptInputSchema = z.object({ id: z.uuid() });
