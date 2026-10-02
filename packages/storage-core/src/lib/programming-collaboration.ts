import 'server-only';
import { collaborationTicketSchema } from '@tuturuuu/realtime/collaboration';
import { signRealtimePayload } from '@tuturuuu/realtime/core/token';
import type { PlaygroundProject } from '@tuturuuu/types/primitives/playgrounds';
import {
  AccountServiceError,
  accountPrivateRpc,
} from '@tuturuuu/utils/account-benefits-server';
import {
  getPlayground,
  getPlaygroundMetadata,
  getPlaygroundRun,
  savePlayground,
} from './playground-service';

function endpoint() {
  const url = new URL(
    process.env.PROGRAMMING_REALTIME_URL ??
      'wss://meet-realtime.tuturuuu.com/collaboration'
  );
  if (
    url.protocol !== 'wss:' &&
    !(
      process.env.NODE_ENV !== 'production' &&
      url.protocol === 'ws:' &&
      ['localhost', '127.0.0.1'].includes(url.hostname)
    )
  )
    throw new AccountServiceError(503);
  url.pathname = '/collaboration';
  url.search = '';
  return url;
}
export async function programmingRoomTicket(
  scope: {
    actorId: string;
    ownerId: string;
    resourceId: string;
    resource: 'playground' | 'problem';
    roomId: string;
    role: 'owner' | 'editor' | 'viewer';
    displayName: string;
    meetingId?: string;
  },
  seed:
    | Pick<PlaygroundProject, 'files' | 'command' | 'revision'>
    | (() => Promise<
        Pick<PlaygroundProject, 'files' | 'command' | 'revision'>
      >),
  checkpoint = false
) {
  const url = endpoint();
  const secret = process.env.MEET_REALTIME_TOKEN_SECRET;
  if (!secret) throw new AccountServiceError(503);
  const payload = collaborationTicketSchema.parse({
    aud: 'tuturuuu.collaboration',
    kind: 'join',
    roomId: scope.roomId,
    resourceId: scope.resourceId,
    resource: scope.resource,
    meetingId: scope.meetingId,
    ownerId: scope.ownerId,
    userId: scope.actorId,
    role: scope.role,
    displayName: scope.displayName.slice(0, 100),
    exp: Math.floor(Date.now() / 1000) + 60,
  });
  const http = new URL(url);
  http.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  http.pathname = checkpoint
    ? '/collaboration/checkpoint'
    : '/collaboration/seed';
  if (!checkpoint) {
    const probe = await fetch(http, {
      headers: {
        Authorization: `Bearer ${signRealtimePayload({ ...payload, kind: 'seed' }, secret)}`,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (probe.ok && ((await probe.json()) as { ready: boolean }).ready)
      return {
        endpoint: url.toString(),
        token: signRealtimePayload(payload, secret),
        role: scope.role,
        actorId: scope.actorId,
      };
    if (!probe.ok) throw new AccountServiceError(503);
  }
  const initial = checkpoint
    ? {}
    : typeof seed === 'function'
      ? await seed()
      : seed;
  const response = await fetch(http, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${signRealtimePayload({ ...payload, kind: checkpoint ? 'checkpoint' : 'seed', role: checkpoint ? 'owner' : payload.role }, secret)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(initial),
    cache: 'no-store',
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new AccountServiceError(503);
  const saved = (await response.json()) as { revision?: number };
  return {
    endpoint: url.toString(),
    token: signRealtimePayload(payload, secret),
    role: scope.role,
    actorId: scope.actorId,
    revision: saved.revision,
  };
}
export async function playgroundCollaborationTicket(
  actorId: string,
  id: string,
  displayName: string,
  checkpoint = false
) {
  const scope = await accountPrivateRpc<{
    ownerId: string;
    role: 'owner' | 'editor' | 'viewer';
  }>('playground_collaboration_scope', { p_actor_id: actorId, p_id: id });
  if (checkpoint && scope.role !== 'owner') throw new AccountServiceError(403);
  const project = {
    ...(await getPlaygroundMetadata(scope.ownerId, id)),
    files: [],
  };
  const ticket = await programmingRoomTicket(
    {
      actorId,
      ownerId: scope.ownerId,
      role: scope.role,
      roomId: `playground:${id}`,
      resource: 'playground',
      resourceId: id,
      displayName,
    },
    () => getPlayground(scope.ownerId, id),
    checkpoint
  );
  return { ...ticket, project };
}
export async function saveProgrammingRoomCheckpoint(
  ownerId: string,
  id: string,
  payload: unknown,
  meetingId?: string,
  runId?: string,
  runnerId?: string
) {
  if (runId && runnerId) {
    const run = await getPlaygroundRun(ownerId, id, runId);
    if (['succeeded', 'failed', 'cancelled'].includes(run.status))
      return {
        ...(await savePlayground(ownerId, id, payload, undefined, meetingId)),
        runComplete: true,
      };
    if (run.status !== 'running') throw new AccountServiceError(409);
    const scope = await accountPrivateRpc<{
      actorId: string;
      projectId: string;
      revision: number;
      meetingId?: string;
    }>('authorize_playground_callback', {
      p_runner_id: runnerId,
      p_run_id: runId,
    });
    if (
      scope.actorId !== ownerId ||
      scope.projectId !== id ||
      (scope.meetingId ?? undefined) !== meetingId ||
      scope.revision !== (payload as { revision: number }).revision
    )
      throw new AccountServiceError(403);
    return savePlayground(ownerId, id, payload, runId, meetingId);
  }
  return savePlayground(ownerId, id, payload, undefined, meetingId);
}
