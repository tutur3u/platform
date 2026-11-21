/**
 * Typed client for the Mastermind fleet thread routes of Web: the machines,
 * projects, threads and history of the owner's fleet, read markers, and
 * replies into a thread. Every call resolves to a result instead of
 * throwing, because the refusals are states a screen shows (the machine is
 * offline, a second factor is needed), and every body is checked against its
 * schema before it is handed on.
 */
import { z } from 'zod';
import {
  createInternalApiClient,
  type InternalApiClientOptions,
} from './client';

const BASE = '/api/v1/mastermind/fleet';

const machineId = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/u);
const environmentId = z.string().regex(/^\w[\w-]{0,99}$/u);
const threadId = z.string().regex(/^[\w:%.][\w:%.-]{0,399}$/u);
const projectId = z.string().regex(/^[\w:%.-]{1,400}$/u);
const replyId = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
const count = z.number().int().min(0);
const stamp = z.string().max(40);

export const fleetThreadStates = [
  'running',
  'waiting',
  'failed',
  'idle',
] as const;
export type FleetThreadState = (typeof fleetThreadStates)[number];

/** The `projectId` that asks for threads in no project. */
export const FLEET_NO_PROJECT = 'none';
export const FLEET_REPLY_MAX_CHARS = 4000;

export const fleetThreadSchema = z.object({
  threadId,
  title: z.string().max(200),
  /** Whatever id the machine has for it; only a filter needs a strict one. */
  projectId: z.string().max(400).optional(),
  project: z.string().max(200).optional(),
  state: z.enum(fleetThreadStates),
  updatedAt: stamp,
  itemCount: count,
  /** How many items the owner has seen; absent until a marker exists. */
  seenItemCount: count.optional(),
  /** When the owner last wrote in the thread; only when asked for and known. */
  lastOwnerReplyAt: stamp.optional(),
});
export type FleetThread = z.infer<typeof fleetThreadSchema>;

const stateCounts = z.object({
  threadCount: count,
  counts: z.object({
    running: count,
    waiting: count,
    failed: count,
    idle: count,
  }),
});

export const fleetThreadMachinesSchema = z.object({
  machineId,
  machines: z
    .array(
      z.object({
        /** Absent for the bridge machine itself. */
        environmentId: environmentId.optional(),
        label: z.string().max(80),
        reachable: z.boolean(),
      })
    )
    .max(32),
});
export type FleetThreadMachines = z.infer<typeof fleetThreadMachinesSchema>;

export const fleetThreadProjectsSchema = z.object({
  machineId,
  projects: z
    .array(
      stateCounts.extend({
        projectId,
        project: z.string().max(200),
        latestUpdatedAt: stamp,
      })
    )
    .max(200),
  unassigned: stateCounts,
  /** All projects with live threads, of which `projects` holds the newest. */
  total: count,
});
export type FleetThreadProjects = z.infer<typeof fleetThreadProjectsSchema>;

export const fleetThreadPageSchema = z.object({
  machineId,
  environmentId: environmentId.optional(),
  threads: z.array(fleetThreadSchema).max(100),
  nextCursor: count.nullable(),
  total: count,
});
export type FleetThreadPage = z.infer<typeof fleetThreadPageSchema>;

export const fleetThreadMessageSchema = z.object({
  position: count,
  role: z.enum(['user', 'assistant']),
  text: z.string().max(8000),
  truncated: z.boolean(),
  at: stamp,
});
export type FleetThreadMessage = z.infer<typeof fleetThreadMessageSchema>;

export const fleetThreadMessagesSchema = z.object({
  machineId,
  environmentId: environmentId.optional(),
  thread: fleetThreadSchema,
  /** Oldest first. */
  messages: z.array(fleetThreadMessageSchema).max(50),
  /** Pass as `before` for the page before this one; null at the start. */
  earlierPosition: count.nullable(),
});
export type FleetThreadMessages = z.infer<typeof fleetThreadMessagesSchema>;

export const fleetReplyStates = [
  'sent',
  'delivered',
  'failed',
  'expired',
] as const;
export const fleetReplyDeliveries = ['steered', 'started', 'queued'] as const;

export const fleetReplySchema = z.object({
  id: replyId,
  machineId,
  threadId,
  environmentId: environmentId.optional(),
  /** `sent`: held for the machine. `delivered`: the machine put it in the thread. */
  state: z.enum(fleetReplyStates),
  /** How the machine delivered it; `steered` went into the running turn. */
  delivery: z.enum(fleetReplyDeliveries).optional(),
  /** Why a `failed` reply failed; a closed code, never thread content. */
  code: z.string().max(64).optional(),
  createdAt: stamp,
  settledAt: stamp.optional(),
});
export type FleetReply = z.infer<typeof fleetReplySchema>;

export const fleetBridgeLiveSchema = z.object({
  machines: z
    .array(
      z.object({
        machineId,
        connected: z.boolean(),
        connectedAt: stamp.optional(),
        lastSeenAt: stamp.optional(),
        disconnectedAt: stamp.optional(),
      })
    )
    .max(64),
  /** The newest change notice per machine and topic; a hint to read again. */
  pokes: z
    .array(
      z.object({
        machineId,
        topic: z.string().max(40),
        revision: count,
        observedAt: z.string().max(64),
      })
    )
    .max(512),
});
export type FleetBridgeLive = z.infer<typeof fleetBridgeLiveSchema>;

/** Every refusal a thread screen can show; anything else is `unavailable`. */
export const fleetThreadFailures = [
  'machine_offline',
  'timeout',
  'unknown_thread',
  'rate_limited',
  'mfa_required',
  'unauthorized',
  'forbidden',
  'invalid_query',
  'invalid_reply',
  'unsupported_for_linked_machine',
  'idempotency_key_required',
  'idempotency_conflict',
  'outbox_full',
  'budget_exhausted',
  'stopped',
  'not_found',
  'unavailable',
  /** Web answered, but not in the shape this client knows. */
  'invalid_response',
] as const;
export type FleetThreadFailure = (typeof fleetThreadFailures)[number];

export type FleetThreadResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: FleetThreadFailure;
      /** HTTP status, or 0 when no response arrived. */
      status: number;
      /** With `mfa_required` on a reply: how recent the proof must be. */
      maxAgeSeconds?: number;
    };

const BY_STATUS: Partial<Record<number, FleetThreadFailure>> = {
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  429: 'rate_limited',
  504: 'timeout',
};

async function call<T>(
  schema: z.ZodType<T>,
  path: string,
  init: Parameters<ReturnType<typeof createInternalApiClient>['fetch']>[1],
  options?: InternalApiClientOptions
): Promise<FleetThreadResult<T>> {
  let response: Response;
  try {
    response = await createInternalApiClient(options).fetch(path, {
      cache: 'no-store',
      ...init,
    });
  } catch {
    return { ok: false, error: 'unavailable', status: 0 };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // An empty or non-JSON body is handled by status below.
  }
  if (!response.ok) {
    const fields = (body ?? {}) as { error?: unknown; maxAgeSeconds?: unknown };
    const known = fleetThreadFailures.find((code) => code === fields.error);
    const error = known ?? BY_STATUS[response.status] ?? 'unavailable';
    return {
      ok: false,
      error,
      status: response.status,
      ...(error === 'mfa_required' && Number.isSafeInteger(fields.maxAgeSeconds)
        ? { maxAgeSeconds: fields.maxAgeSeconds as number }
        : {}),
    };
  }
  const parsed = schema.safeParse(body);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: 'invalid_response', status: response.status };
}

type Machine = { machineId: string; environmentId?: string };

/** Which machines hold a bridge socket, and the newest change notices. */
export function getFleetBridgeLive(options?: InternalApiClientOptions) {
  return call(fleetBridgeLiveSchema, `${BASE}/live`, {}, options);
}

/** The bridge machine and the machines linked to it. */
export function listFleetThreadMachines(
  machine: Pick<Machine, 'machineId'>,
  options?: InternalApiClientOptions
) {
  return call(
    fleetThreadMachinesSchema,
    `${BASE}/threads/machines`,
    { query: { machineId: machine.machineId } },
    options
  );
}

/** Projects of the bridge machine with a thread count per state. */
export function listFleetThreadProjects(
  machine: Pick<Machine, 'machineId'>,
  options?: InternalApiClientOptions
) {
  return call(
    fleetThreadProjectsSchema,
    `${BASE}/threads/projects`,
    { query: { machineId: machine.machineId } },
    options
  );
}

export type FleetThreadListInput = Machine & {
  /** Title search. */
  query?: string;
  /** One project, or `FLEET_NO_PROJECT`. */
  projectId?: string;
  state?: FleetThreadState;
  /** Adds `lastOwnerReplyAt`; the bridge machine only. */
  ownerReply?: boolean;
  cursor?: number;
  /** 1 to 50. */
  limit?: number;
};

/** One page of threads, newest first. */
export function listFleetThreads(
  input: FleetThreadListInput,
  options?: InternalApiClientOptions
) {
  return call(
    fleetThreadPageSchema,
    `${BASE}/threads`,
    {
      query: {
        machineId: input.machineId,
        environmentId: input.environmentId,
        q: input.query?.trim() || undefined,
        projectId: input.projectId,
        state: input.state,
        include: input.ownerReply ? 'ownerReply' : undefined,
        cursor: input.cursor,
        limit: input.limit,
      },
    },
    options
  );
}

export type FleetThreadMessagesInput = Machine & {
  threadId: string;
  /** `earlierPosition` of the page after the one wanted; omit for the newest. */
  before?: number;
  /** 1 to 30. */
  limit?: number;
};

/** One page of a thread's user and assistant messages. */
export function listFleetThreadMessages(
  input: FleetThreadMessagesInput,
  options?: InternalApiClientOptions
) {
  return call(
    fleetThreadMessagesSchema,
    `${BASE}/threads/messages`,
    {
      query: {
        machineId: input.machineId,
        environmentId: input.environmentId,
        threadId: input.threadId,
        before: input.before,
        limit: input.limit,
      },
    },
    options
  );
}

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

/** Records that the owner has seen `itemCount` items of a thread. */
export function markFleetThreadRead(
  input: Machine & { threadId: string; itemCount: number },
  options?: InternalApiClientOptions
) {
  return call(
    z.object({ saved: z.boolean() }),
    `${BASE}/threads/read`,
    json(input),
    options
  );
}

export type FleetReplyInput = Machine & {
  threadId: string;
  text: string;
  /**
   * A UUID made once per reply and reused on every retry of it, so a retry
   * returns the first receipt instead of sending the text twice.
   */
  idempotencyKey: string;
};

/**
 * Sends the owner's reply into a thread. `mfa_required` means the session
 * needs a second-factor proof no older than `maxAgeSeconds`; retry with the
 * same key after it.
 */
export function sendFleetThreadReply(
  { idempotencyKey, ...reply }: FleetReplyInput,
  options?: InternalApiClientOptions
) {
  return call(
    fleetReplySchema,
    `${BASE}/replies`,
    json(reply, { 'Idempotency-Key': idempotencyKey }),
    options
  );
}

/** The current receipt of a reply. */
export function getFleetThreadReply(
  id: string,
  options?: InternalApiClientOptions
) {
  return call(
    fleetReplySchema,
    `${BASE}/replies/${encodeURIComponent(id)}`,
    {},
    options
  );
}

/** A reply is settled once the machine has delivered, refused or outlived it. */
export const isFleetReplySettled = (reply: Pick<FleetReply, 'state'>) =>
  reply.state !== 'sent';
