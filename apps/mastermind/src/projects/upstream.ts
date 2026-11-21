import type { InternalApiClientOptions } from '@tuturuuu/internal-api/client';
import {
  type FleetReply,
  type FleetThreadMachines,
  type FleetThreadResult,
  getFleetBridgeLive,
  getFleetThreadReply,
  listFleetThreadMachines,
  listFleetThreadMessages,
  listFleetThreadProjects,
  listFleetThreads,
  markFleetThreadRead,
  sendFleetThreadReply,
} from '@tuturuuu/internal-api/mastermind-threads';
import type { Owner } from '../native/auth';
import { threadErrorCode } from './model';
import type {
  MessagesInput,
  ProjectsSnapshot,
  ReadInput,
  ReplyInput,
  ThreadMessages,
  ThreadPage,
  ThreadResult,
  ThreadsInput,
} from './contract';

const WEB_ORIGIN = 'https://tuturuuu.com';
/** Linked machines answer in 4-8 s; the bridge machine in well under one. */
const TIMEOUT_MS = 12_000;

/**
 * The owner's bearer on every call. Redirects are refused before a body is
 * read, and a request past its time answers as a gateway timeout so it
 * reads as `timeout`, not as a machine that is gone.
 */
export function threadApiOptions(
  token: string,
  fetchImpl: typeof fetch = fetch
): InternalApiClientOptions {
  return {
    baseUrl: WEB_ORIGIN,
    defaultHeaders: { Authorization: `Bearer ${token}` },
    async fetch(input, init) {
      let response: Response;
      try {
        response = await fetchImpl(
          new Request(input, {
            ...init,
            redirect: 'manual',
            signal: AbortSignal.timeout(TIMEOUT_MS),
          })
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === 'TimeoutError')
          return Response.json({ error: 'timeout' }, { status: 504 });
        throw error;
      }
      if (
        String(response.type) === 'opaqueredirect' ||
        (response.status >= 300 && response.status < 400)
      )
        throw new Error('Upstream redirect refused');
      return response;
    },
  };
}

/**
 * Owner thread reads and replies through the shared Mastermind thread
 * client. Reads come back as the page's results; replies keep the client's
 * own result, which the reply state machine reads.
 */
export function createThreadsClient(
  owner: Owner,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now
) {
  const options = threadApiOptions(owner.token, fetcher);
  const page = <T>(result: FleetThreadResult<T>): ThreadResult<T> =>
    result.ok
      ? {
          kind: 'ok',
          data: result.data,
          fetchedAt: new Date(now()).toISOString(),
        }
      : { kind: 'error', code: threadErrorCode(result.error) };

  return {
    async machines(
      machineId: string
    ): Promise<ThreadResult<FleetThreadMachines>> {
      return page(await listFleetThreadMachines({ machineId }, options));
    },
    async projects(machineId: string): Promise<ThreadResult<ProjectsSnapshot>> {
      return page(await listFleetThreadProjects({ machineId }, options));
    },
    async threads(
      machineId: string,
      { q, ...input }: ThreadsInput
    ): Promise<ThreadResult<ThreadPage>> {
      return page(
        await listFleetThreads({ machineId, query: q, ...input }, options)
      );
    },
    async messages(
      machineId: string,
      input: MessagesInput
    ): Promise<ThreadResult<ThreadMessages>> {
      return page(
        await listFleetThreadMessages({ machineId, ...input }, options)
      );
    },
    /** Moves the owner's read marker forward; it never holds content. */
    async markRead(
      machineId: string,
      input: ReadInput
    ): Promise<ThreadResult<{ saved: boolean }>> {
      return page(await markFleetThreadRead({ machineId, ...input }, options));
    },
    reply(
      machineId: string,
      input: ReplyInput
    ): Promise<FleetThreadResult<FleetReply>> {
      return sendFleetThreadReply({ machineId, ...input }, options);
    },
    receipt(id: string): Promise<FleetThreadResult<FleetReply>> {
      return getFleetThreadReply(id, options);
    },
    /** The bridge machine's id, from the owner live state: connected first. */
    async bridgeMachineId(): Promise<string | undefined> {
      const live = await getFleetBridgeLive(options);
      if (!live.ok) return undefined;
      const machines = live.data.machines;
      return (machines.find((m) => m.connected) ?? machines[0])?.machineId;
    },
  };
}

export type ThreadsClient = ReturnType<typeof createThreadsClient>;
