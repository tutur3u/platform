import { z } from 'zod';
import type { Owner } from '../native/auth';
import {
  type MessagesInput,
  messagesInputSchema,
  type ProjectsSnapshot,
  projectsSchema,
  type ReadInput,
  type ReplyInput,
  type ReplyReceipt,
  replyReceiptSchema,
  type ThreadErrorCode,
  type ThreadMachine,
  type ThreadMessages,
  threadMachinesSchema,
  threadMessagesSchema,
  type ThreadPage,
  type ThreadResult,
  type ThreadsInput,
  threadPageSchema,
  threadsInputSchema,
} from './contract';

const liveMachinesSchema = z.object({
  machines: z.array(
    z.object({ machineId: z.string().max(64), connected: z.boolean() })
  ),
});

const readAnswerSchema = z.object({ saved: z.boolean() });

const WEB_FLEET = 'https://tuturuuu.com/api/v1/mastermind/fleet';
/** Linked machines answer in 4-8 s; the bridge machine in well under one. */
const TIMEOUT_MS = 12_000;

/** Maps a refusal to its closed code; the body's `error` wins when known. */
export function threadErrorCode(
  status: number,
  error: unknown
): ThreadErrorCode {
  if (error === 'machine_offline') return 'machine_offline';
  if (error === 'forbidden') return 'denied';
  if (error === 'mfa_required') return 'mfa_required';
  if (error === 'unsupported_for_linked_machine')
    return 'unsupported_for_linked_machine';
  if (status === 504) return 'timeout';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403) return 'denied';
  if (status === 400 || status === 422) return 'invalid';
  return 'unavailable';
}

function query(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== '') params.set(key, String(value));
  const text = params.toString();
  return text ? `?${text}` : '';
}

/**
 * Owner thread reads and replies against Web with the owner's satellite
 * bearer. Redirects are refused before any body is read, and every answer
 * is parsed against the contract.
 */
export function createThreadsClient(
  owner: Owner,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now
) {
  const headers = { Authorization: `Bearer ${owner.token}` };

  async function call<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit = {}
  ): Promise<ThreadResult<T>> {
    try {
      const response = await fetcher(
        new Request(`${WEB_FLEET}${path}`, {
          ...init,
          headers: { ...headers, ...init.headers },
          redirect: 'manual',
          cache: 'no-store',
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      );
      if (
        String(response.type) === 'opaqueredirect' ||
        (response.status >= 300 && response.status < 400)
      )
        return { kind: 'error', code: 'unavailable' };
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const error =
          body && typeof body === 'object'
            ? (body as Record<string, unknown>).error
            : undefined;
        return { kind: 'error', code: threadErrorCode(response.status, error) };
      }
      const parsed = schema.safeParse(body);
      return parsed.success
        ? {
            kind: 'ok',
            data: parsed.data,
            fetchedAt: new Date(now()).toISOString(),
          }
        : { kind: 'error', code: 'invalid' };
    } catch (error) {
      return {
        kind: 'error',
        code:
          error instanceof DOMException && error.name === 'TimeoutError'
            ? 'timeout'
            : 'unavailable',
      };
    }
  }

  return {
    async machines(machineId?: string): Promise<ThreadResult<ThreadMachine[]>> {
      const result = await call(
        `/threads/machines${query({ machineId })}`,
        threadMachinesSchema
      );
      return result.kind === 'ok'
        ? { ...result, data: result.data.machines }
        : result;
    },
    projects(
      machineId: string | undefined,
      environmentId?: string
    ): Promise<ThreadResult<ProjectsSnapshot>> {
      return call(
        `/threads/projects${query({ machineId, environmentId })}`,
        projectsSchema
      );
    },
    threads(
      machineId: string | undefined,
      input: ThreadsInput
    ): Promise<ThreadResult<ThreadPage>> {
      const data = threadsInputSchema.parse(input);
      return call(`/threads${query({ machineId, ...data })}`, threadPageSchema);
    },
    messages(
      machineId: string | undefined,
      input: MessagesInput
    ): Promise<ThreadResult<ThreadMessages>> {
      const data = messagesInputSchema.parse(input);
      return call(
        `/threads/messages${query({ machineId, ...data })}`,
        threadMessagesSchema
      );
    },
    reply(
      machineId: string | undefined,
      { idempotencyKey, ...input }: ReplyInput
    ): Promise<ThreadResult<ReplyReceipt>> {
      return call('/replies', replyReceiptSchema, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ machineId, ...input }),
      });
    },
    /** Moves the owner's read marker forward; it never holds content. */
    markRead(
      machineId: string | undefined,
      input: ReadInput
    ): Promise<ThreadResult<{ saved: boolean }>> {
      return call('/threads/read', readAnswerSchema, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId, ...input }),
      });
    },
    receipt(id: string): Promise<ThreadResult<ReplyReceipt>> {
      return call(`/replies/${encodeURIComponent(id)}`, replyReceiptSchema);
    },
    /** The bridge machine's id, from the owner live state: connected first. */
    async bridgeMachineId(): Promise<string | undefined> {
      const live = await call('/live', liveMachinesSchema);
      if (live.kind !== 'ok') return undefined;
      const machines = live.data.machines;
      return (machines.find((m) => m.connected) ?? machines[0])?.machineId;
    },
  };
}
