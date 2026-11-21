import { createServerFn } from '@tanstack/react-start';
import { createOwnerMemo } from '../native/clients';
import { currentOwner } from '../native/context';
import {
  messagesInputSchema,
  projectsInputSchema,
  readInputSchema,
  receiptInputSchema,
  replyInputSchema,
  threadsInputSchema,
} from './contract';
import { createFixtureThreadsClient } from './fixtures';
import { createThreadsClient } from './upstream';

/**
 * The Projects page's only data path. Each function runs after the Worker's
 * owner gates and talks to Web with the owner's own bearer. A development
 * build started with `VITE_MASTERMIND_THREAD_FIXTURES=1` reads in-memory
 * fixtures instead.
 */
const fixtures =
  import.meta.env.DEV &&
  import.meta.env.VITE_MASTERMIND_THREAD_FIXTURES === '1';

function client() {
  return fixtures
    ? createFixtureThreadsClient()
    : createThreadsClient(currentOwner());
}

const bridgeMachine = createOwnerMemo<string>();

/** Thread routes are keyed by the bridge machine, remembered for a minute. */
async function withMachine() {
  const threads = client();
  if (fixtures) return { threads, machineId: 'fixture' };
  const owner = currentOwner();
  let machineId = bridgeMachine.get(owner);
  if (!machineId) {
    machineId = await threads.bridgeMachineId();
    if (machineId) bridgeMachine.set(owner, machineId);
  }
  return { threads, machineId };
}

export const threadMachinesFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { threads, machineId } = await withMachine();
    return threads.machines(machineId);
  }
);

export const threadProjectsFn = createServerFn({ method: 'GET' })
  .validator(projectsInputSchema)
  .handler(async ({ data }) => {
    const { threads, machineId } = await withMachine();
    return threads.projects(machineId, data.environmentId);
  });

export const threadPageFn = createServerFn({ method: 'GET' })
  .validator(threadsInputSchema)
  .handler(async ({ data }) => {
    const { threads, machineId } = await withMachine();
    return threads.threads(machineId, data);
  });

export const threadMessagesFn = createServerFn({ method: 'GET' })
  .validator(messagesInputSchema)
  .handler(async ({ data }) => {
    const { threads, machineId } = await withMachine();
    return threads.messages(machineId, data);
  });

export const threadReplyFn = createServerFn({ method: 'POST' })
  .validator(replyInputSchema)
  .handler(async ({ data }) => {
    const { threads, machineId } = await withMachine();
    return threads.reply(machineId, data);
  });

export const markThreadReadFn = createServerFn({ method: 'POST' })
  .validator(readInputSchema)
  .handler(async ({ data }) => {
    const { threads, machineId } = await withMachine();
    return threads.markRead(machineId, data);
  });

export const replyReceiptFn = createServerFn({ method: 'GET' })
  .validator(receiptInputSchema)
  .handler(({ data }) => client().receipt(data.id));
