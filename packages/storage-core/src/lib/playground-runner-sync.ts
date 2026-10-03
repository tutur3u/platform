import 'server-only';
import { createHash } from 'node:crypto';
import { collaborationTicketSchema } from '@tuturuuu/realtime/collaboration';
import {
  signRealtimePayload,
  verifyRealtimePayload,
} from '@tuturuuu/realtime/core/token';
import type { PlaygroundFile } from '@tuturuuu/types/primitives/playgrounds';
import { AccountServiceError } from '@tuturuuu/utils/account-benefits-server';
import { PlaygroundJob } from '@tuturuuu/utils/playground-schema';
import { getPlayground } from './playground-service';
import { programmingRoomTicket } from './programming-collaboration';

/** Runner exports share the room's revision stream; they never write around its CRDT. */
export async function syncPlaygroundRunnerFiles(input: {
  actorId: string;
  projectId: string;
  revision: number;
  meetingId?: string;
  runnerId: string;
  runId: string;
  files: PlaygroundFile[];
  paths: string[];
  jobCommand: string[];
}) {
  if (
    input.jobCommand.length !== 2 ||
    input.jobCommand[0] !== '__ttr_playground_v1__'
  )
    throw new AccountServiceError(400);
  const job = PlaygroundJob.parse(
    JSON.parse(Buffer.from(input.jobCommand[1]!, 'base64url').toString('utf8'))
  );
  if (
    job.projectId !== input.projectId ||
    job.operation !== 'run' ||
    !job.files
  )
    throw new AccountServiceError(403);
  const baseline = Object.fromEntries(
    job.files.map((file) => [
      file.path,
      createHash('sha256').update(file.content).digest('hex'),
    ])
  );
  const join = await programmingRoomTicket(
    {
      actorId: input.actorId,
      ownerId: input.actorId,
      resourceId: input.projectId,
      resource: 'playground',
      meetingId: input.meetingId,
      role: 'owner',
      displayName: 'Runner',
      roomId: input.meetingId
        ? `meeting:${input.meetingId}:playground:${input.projectId}`
        : `playground:${input.projectId}`,
    },
    () => getPlayground(input.actorId, input.projectId)
  );
  const secret = process.env.MEET_REALTIME_TOKEN_SECRET;
  const ticket = collaborationTicketSchema.parse(
    verifyRealtimePayload(join.token, secret)
  );
  const endpoint = new URL(join.endpoint);
  endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
  endpoint.pathname = '/collaboration/runner-files';
  const response = await fetch(endpoint, {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(35000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${signRealtimePayload(
        {
          ...ticket,
          kind: 'runner-files',
          runId: input.runId,
          runnerId: input.runnerId,
        },
        secret
      )}`,
    },
    body: JSON.stringify({
      revision: input.revision,
      baseline,
      files: input.files,
      paths: input.paths,
    }),
  });
  if (!response.ok)
    throw new AccountServiceError(response.status === 409 ? 409 : 503);
  return (await response.json()) as { revision: number };
}
