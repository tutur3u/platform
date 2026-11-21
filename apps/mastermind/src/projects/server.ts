import { createServerFn } from '@tanstack/react-start';
import type {
  FleetReply,
  FleetThreadResult,
} from '@tuturuuu/internal-api/mastermind-threads';
import { createOwnerMemo } from '../native/clients';
import { currentOwner } from '../native/context';
import {
  messagesInputSchema,
  projectsInputSchema,
  readInputSchema,
  receiptInputSchema,
  replyInputSchema,
  type ThreadContext,
  type ThreadResult,
  threadsInputSchema,
} from './contract';
import { createFixtureThreadsClient, FIXTURE_OWNER } from './fixtures';
import { createThreadsClient, type ThreadsClient } from './upstream';

/**
 * The Projects page's only data path. Each function runs after the Worker's
 * owner gates and talks to Web with the owner's own bearer. A development
 * build started with `VITE_MASTERMIND_THREAD_FIXTURES=1` reads in-memory
 * fixtures instead.
 */
const fixtures =
  import.meta.env.DEV &&
  import.meta.env.VITE_MASTERMIND_THREAD_FIXTURES === '1';

const bridgeMachine = createOwnerMemo<string>();
const NO_BRIDGE = { kind: 'error', code: 'unavailable' } as const;
const NO_BRIDGE_REPLY = {
  ok: false,
  error: 'unavailable',
  status: 0,
} as const satisfies FleetThreadResult<FleetReply>;

/** Thread routes are keyed by the bridge machine, remembered for a minute. */
async function withMachine(): Promise<{
  threads: ThreadsClient;
  machineId?: string;
  ownerId: string;
}> {
  if (fixtures)
    return {
      threads: createFixtureThreadsClient(),
      machineId: 'fixture',
      ownerId: FIXTURE_OWNER,
    };
  const owner = currentOwner();
  const threads = createThreadsClient(owner);
  let machineId = bridgeMachine.get(owner);
  if (!machineId) {
    machineId = await threads.bridgeMachineId();
    if (machineId) bridgeMachine.set(owner, machineId);
  }
  return { threads, machineId, ownerId: owner.id };
}

export const threadMachinesFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ThreadResult<ThreadContext>> => {
    const { threads, machineId, ownerId } = await withMachine();
    // A refusal still names the signed-in owner, so the browser opens only
    // that owner's cached lists.
    if (!machineId) return { ...NO_BRIDGE, ownerId };
    const result = await threads.machines(machineId);
    return result.kind === 'ok'
      ? { ...result, data: { ...result.data, ownerId } }
      : { ...result, ownerId };
  }
);

export const threadProjectsFn = createServerFn({ method: 'GET' })
  .validator(projectsInputSchema)
  .handler(async () => {
    const { threads, machineId } = await withMachine();
    return machineId ? threads.projects(machineId) : NO_BRIDGE;
  });

export const threadPageFn = createServerFn({ method: 'GET' })
  .validator(threadsInputSchema)
  .handler(async ({ data }) => {
    const { threads, machineId } = await withMachine();
    return machineId ? threads.threads(machineId, data) : NO_BRIDGE;
  });

export const threadMessagesFn = createServerFn({ method: 'GET' })
  .validator(messagesInputSchema)
  .handler(async ({ data }) => {
    const { threads, machineId } = await withMachine();
    return machineId ? threads.messages(machineId, data) : NO_BRIDGE;
  });

export const markThreadReadFn = createServerFn({ method: 'POST' })
  .validator(readInputSchema)
  .handler(async ({ data }) => {
    const { threads, machineId } = await withMachine();
    return machineId ? threads.markRead(machineId, data) : NO_BRIDGE;
  });

export const threadReplyFn = createServerFn({ method: 'POST' })
  .validator(replyInputSchema)
  .handler(async ({ data }) => {
    const { threads, machineId } = await withMachine();
    return machineId ? threads.reply(machineId, data) : NO_BRIDGE_REPLY;
  });

export const replyReceiptFn = createServerFn({ method: 'GET' })
  .validator(receiptInputSchema)
  .handler(async ({ data }) => {
    const { threads } = await withMachine();
    return threads.receipt(data.id);
  });
