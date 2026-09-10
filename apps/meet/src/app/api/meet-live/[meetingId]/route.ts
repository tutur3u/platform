import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { z } from 'zod';
import { MeetCallAccessError } from '@/features/call/lib/call-access';
import {
  callRoomService,
  personalWorkspace,
  roomRoute,
} from '@/features/call/server/room-service';
import {
  type LiveSessionClaims,
  liveAudienceSchema,
  liveVoiceSchema,
} from '@/features/live-assistant/contracts';
import { readLiveRequestBody } from '@/features/live-assistant/request-body';
import { signLiveSession } from '@/features/live-assistant/token';
import { liveWorkspaceCatalog } from '@/features/live-assistant/workspace-tools';

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('start'),
    mode: liveAudienceSchema,
    timezone: z.string().max(100),
    workspaceId: z.uuid().optional(),
    voice: liveVoiceSchema.default('Aoede'),
  }),
  z.object({ action: z.literal('resume'), sessionId: z.uuid() }),
  z.object({ action: z.literal('stop'), sessionId: z.uuid() }),
]);
export async function POST(
  request: Request,
  context: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await context.params;
  return roomRoute(request, meetingId, async (access) => {
    const body = await readLiveRequestBody(request, 2000);
    if (!body.ok)
      throw new MeetCallAccessError(body.status, 'Invalid request body');
    const input = schema.safeParse(body.data);
    if (!input.success) throw new MeetCallAccessError(400, 'Invalid request');
    const cloudflare = await getCloudflareContext({ async: true });
    const env = cloudflare.env as unknown as {
      MEET_LIVE: DurableObjectNamespace;
      MEET_REALTIME_TOKEN_SECRET: string;
      GOOGLE_GENERATIVE_AI_API_KEY?: string;
    };
    if (!env.MEET_LIVE || !env.GOOGLE_GENERATIVE_AI_API_KEY)
      throw new MeetCallAccessError(503, 'Live assistant is unavailable');
    const command = input.data;
    const sharedContext =
      command.action === 'stop'
        ? undefined
        : await callRoomService(access, { action: 'live.context' });
    if (command.action !== 'start') {
      const object = env.MEET_LIVE.get(
        env.MEET_LIVE.idFromName(command.sessionId)
      );
      let ownerId = access.user.id;
      if (command.action === 'stop' && access.isHost) {
        const context = await callRoomService<{
          live?: { sessionId: string; ownerId: string };
        }>(access, { action: 'live.context' }).catch(() => undefined);
        if (context?.live?.sessionId === command.sessionId) {
          ownerId = context.live.ownerId;
          await callRoomService(access, {
            action: 'live.stop',
            sessionId: command.sessionId,
          });
        }
      }
      const response = await object.fetch('https://live.internal/control', {
        method: 'POST',
        body: JSON.stringify({
          ownerId,
          meetingId,
          action: command.action,
        }),
      });
      if (!response.ok)
        throw new MeetCallAccessError(
          response.status,
          'Assistant session unavailable'
        );
      if (command.action === 'stop') return { ok: true };
      const claims = (await response.json()) as LiveSessionClaims;
      return {
        sessionId: claims.sessionId,
        token: signLiveSession(
          { ...claims, expiresAt: Date.now() + 120000 },
          env.MEET_REALTIME_TOKEN_SECRET
        ),
        mode: claims.mode,
      };
    }
    if (command.mode === 'room' && !access.isHost)
      throw new MeetCallAccessError(
        403,
        'Only a room admin can invite the room assistant'
      );
    const claims: LiveSessionClaims = {
      audience: 'meet-live',
      sessionId: crypto.randomUUID(),
      meetingId,
      ownerId: access.user.id,
      billingWorkspaceId: await personalWorkspace(access.user.id),
      mode: command.mode,
      expiresAt: Date.now() + 120000,
    };
    const workspaceId = command.workspaceId ?? claims.billingWorkspaceId;
    const workspace =
      command.mode === 'personal'
        ? {
            id: workspaceId,
            tools: await liveWorkspaceCatalog(
              access,
              workspaceId,
              command.timezone
            ),
          }
        : undefined;
    const object = env.MEET_LIVE.get(
      env.MEET_LIVE.idFromName(claims.sessionId)
    );
    const registry = env.MEET_LIVE.get(
      env.MEET_LIVE.idFromName(`owner:${claims.ownerId}`)
    );
    try {
      const initialized = await object.fetch(
        'https://live.internal/initialize',
        {
          method: 'POST',
          body: JSON.stringify({
            claims,
            workspace,
            voice: command.voice,
            identity: {
              workspaceId: access.meeting.ws_id,
              isHost: access.isHost,
              displayName: access.displayName,
            },
            timezone: command.timezone,
            sharedContext: JSON.stringify({
              title: access.meeting.name,
              ...(sharedContext as object),
            }),
          }),
        }
      );
      if (!initialized.ok)
        throw new MeetCallAccessError(503, 'Assistant session unavailable');
      if (command.mode === 'room')
        await callRoomService(access, {
          action: 'live.reserve',
          sessionId: claims.sessionId,
        });
      const registered = await registry.fetch(
        'https://live.internal/registry/register',
        { method: 'POST', body: JSON.stringify(claims) }
      );
      if (!registered.ok)
        throw new MeetCallAccessError(
          409,
          'Stop an existing assistant or wait for privacy settings to update'
        );
      const ready = await object.fetch('https://live.internal/control', {
        method: 'POST',
        body: JSON.stringify({
          ownerId: claims.ownerId,
          meetingId,
          action: 'resume',
        }),
      });
      if (!ready.ok)
        throw new MeetCallAccessError(409, 'Assistant start cancelled');
      if (command.mode === 'room') {
        const context = await callRoomService<{ live?: { sessionId: string } }>(
          access,
          { action: 'live.context' }
        );
        if (context.live?.sessionId !== claims.sessionId)
          throw new MeetCallAccessError(409, 'Assistant start cancelled');
      }
    } catch (error) {
      await registry
        .fetch('https://live.internal/registry/remove', {
          method: 'POST',
          body: JSON.stringify(claims),
        })
        .catch(() => undefined);
      await object
        .fetch('https://live.internal/control', {
          method: 'POST',
          body: JSON.stringify({
            ownerId: claims.ownerId,
            meetingId,
            action: 'stop',
          }),
        })
        .catch(() => undefined);
      if (command.mode === 'room')
        await callRoomService(access, {
          action: 'live.stop',
          sessionId: claims.sessionId,
        }).catch(() => undefined);
      throw error;
    }
    return {
      sessionId: claims.sessionId,
      mode: claims.mode,
      token: signLiveSession(claims, env.MEET_REALTIME_TOKEN_SECRET),
    };
  });
}
