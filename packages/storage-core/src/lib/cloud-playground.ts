import 'server-only';
import {
  signRealtimePayload,
  verifyRealtimePayload,
} from '@tuturuuu/realtime/core/token';
import type { PlaygroundExecutionResult } from '@tuturuuu/types/primitives/playgrounds';
import {
  AccountServiceError,
  accountPrivateRpc,
} from '@tuturuuu/utils/account-benefits-server';
import { cloudPlaygroundRunId } from '@tuturuuu/utils/playground-cloud-run-id';
import { z } from 'zod';
import { getPlayground } from './playground-service';

const scopeSchema = z.strictObject({
  meetingId: z.uuid(),
  ownerId: z.uuid(),
  projectId: z.uuid(),
});
const sourceClaims = scopeSchema.extend({
  aud: z.enum([
    'tuturuuu.meet.playground-source',
    'tuturuuu.meet.playground-export',
  ]),
  kind: z.enum(['playground-source', 'playground-export']),
  runId: z.uuid(),
  roomMeetingId: z.uuid().optional(),
  revision: z.number().int().nonnegative(),
  exp: z.number().int(),
});
const runReceipt = z.object({ runId: z.uuid() });
const cloudRunReceipt = runReceipt.extend({
  startedAt: z.number().int().nonnegative(),
});
const runResult = runReceipt.extend({
  status: z.enum([
    'queued',
    'running',
    'cancel_requested',
    'succeeded',
    'failed',
    'cancelled',
  ]),
  exitCode: z.number().int().nullable(),
  output: z.string(),
  revision: z.number().int().nonnegative(),
  saved: z.boolean(),
});

type Scope = z.infer<typeof scopeSchema>;

const errorCode = z.enum([
  'execution_paused',
  'global_capacity',
  'user_busy',
  'project_busy',
  'user_rate_limit',
  'daily_capacity',
  'request_conflict',
]);
type Denial = z.infer<typeof errorCode>;

export class CloudPlaygroundRefusal extends AccountServiceError {
  readonly code: string;

  constructor(status: number, cause: Denial) {
    super(
      status,
      cause === 'execution_paused'
        ? 'Playground execution is paused'
        : 'Playground run limit reached'
    );
    this.code =
      cause === 'execution_paused'
        ? 'PLAYGROUND_PAUSED'
        : cause === 'request_conflict'
          ? 'PLAYGROUND_REQUEST_CONFLICT'
          : 'PLAYGROUND_CAPACITY';
  }
}

export function useCloudMeetPlayground() {
  return process.env.MEET_PLAYGROUND_EXECUTION_PROVIDER === 'cloudflare';
}

export function isCloudPlaygroundRun(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    id
  );
}

async function callCloudPlayground(
  path:
    | '/run'
    | '/stop'
    | '/result'
    | `/writeback/${'verify' | 'claim' | 'settle'}`,
  payload: unknown,
  timeoutMs = 8000
) {
  const origin = process.env.PLAYGROUND_EXECUTION_ORIGIN;
  const secret = process.env.PLAYGROUND_INGRESS_SECRET;
  if (!origin || !secret || secret.length < 32)
    throw new AccountServiceError(503);
  const url = new URL(path, origin);
  if (url.protocol !== 'https:') throw new AccountServiceError(503);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new AccountServiceError(503);
  }
  if (response.ok) return response.json() as Promise<unknown>;
  const parsed = z
    .object({ code: errorCode })
    .safeParse(await response.json().catch(() => null));
  if (parsed.success)
    throw new CloudPlaygroundRefusal(response.status, parsed.data.code);
  throw new AccountServiceError(
    response.status === 404 || response.status === 409 ? response.status : 503
  );
}

export async function startCloudPlayground(
  scope: Scope,
  request: {
    requester: string;
    requestId: string;
    stdin?: string;
    revision: number;
  },
  roomMeetingId?: string
) {
  const secret = process.env.PLAYGROUND_SOURCE_TICKET_SECRET;
  if (!secret || secret.length < 32) throw new AccountServiceError(503);
  const claims = {
    ...scope,
    runId: await cloudPlaygroundRunId({ ...scope, ...request }),
    roomMeetingId,
    revision: request.revision,
    exp: Math.floor(Date.now() / 1000) + 60,
  };
  function ticket(aud: z.infer<typeof sourceClaims>['aud']) {
    const kind =
      aud === 'tuturuuu.meet.playground-source'
        ? 'playground-source'
        : 'playground-export';
    return signRealtimePayload(
      sourceClaims.parse({ ...claims, aud, kind }),
      secret
    );
  }
  return cloudRunReceipt.parse(
    await callCloudPlayground('/run', {
      ...scope,
      ...request,
      sourceTicket: ticket('tuturuuu.meet.playground-source'),
      exportTicket: ticket('tuturuuu.meet.playground-export'),
    })
  );
}

export async function stopCloudPlayground(scope: Scope, runId?: string) {
  return runReceipt.parse(
    await callCloudPlayground('/stop', { ...scope, runId })
  );
}

export async function readCloudPlayground(
  scope: Scope,
  runId: string
): Promise<PlaygroundExecutionResult> {
  return runResult.parse(
    await callCloudPlayground('/result', { ...scope, runId })
  );
}

export async function authorizeCloudPlaygroundTicket(
  token: string,
  aud: z.infer<typeof sourceClaims>['aud']
) {
  const secret = process.env.PLAYGROUND_SOURCE_TICKET_SECRET;
  if (!secret || secret.length < 32) throw new AccountServiceError(503);
  const parsed = sourceClaims.safeParse(verifyRealtimePayload(token, secret));
  const now = Math.floor(Date.now() / 1000);
  if (
    !parsed.success ||
    parsed.data.aud !== aud ||
    parsed.data.kind !==
      (aud === 'tuturuuu.meet.playground-source'
        ? 'playground-source'
        : 'playground-export') ||
    parsed.data.exp <= now ||
    parsed.data.exp > now + 60
  ) {
    throw new AccountServiceError(403);
  }
  const { ownerId, meetingId } = parsed.data;
  if (
    !(
      (await accountPrivateRpc<boolean>('meeting_programming_elevated', {
        p_meeting_id: meetingId,
        p_owner_id: ownerId,
      })) ||
      (await accountPrivateRpc<boolean>('account_playgrounds_allowed', {
        p_actor_id: ownerId,
      }))
    )
  ) {
    throw new AccountServiceError(403);
  }
  return parsed.data;
}

export async function readCloudPlaygroundSource(token: string) {
  const { ownerId, projectId, revision } = await authorizeCloudPlaygroundTicket(
    token,
    'tuturuuu.meet.playground-source'
  );
  const project = await getPlayground(ownerId, projectId);
  if (project.revision !== revision || !project.drivePath)
    throw new AccountServiceError(409);
  return {
    operation: 'run' as const,
    projectId,
    revision,
    language: project.language,
    command: project.command,
    files: project.files,
  };
}

export async function cloudPlaygroundWriteback(
  action: 'verify' | 'claim' | 'settle',
  scope: Scope,
  runId: string,
  revision: number,
  claimId?: string,
  savedRevision?: number
) {
  const receipt = z
    .object({ accepted: z.literal(true) })
    .safeParse(
      await callCloudPlayground(
        `/writeback/${action}`,
        { ...scope, runId, revision, claimId, savedRevision },
        action === 'settle' ? 600 : 2000
      )
    );
  if (!receipt.success) {
    throw new AccountServiceError(
      409,
      'Playground run or saved revision changed'
    );
  }
}
