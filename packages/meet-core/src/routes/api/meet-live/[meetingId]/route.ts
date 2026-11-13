import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import {
  callRoomService,
  personalWorkspace,
  roomRoute,
} from '@tuturuuu/meet-core/features/call/server/room-service';
import {
  type LiveSessionClaims,
  liveAudienceSchema,
  liveVoiceSchema,
} from '@tuturuuu/meet-core/features/live-assistant/contracts';
import { readLiveRequestBody } from '@tuturuuu/meet-core/features/live-assistant/request-body';
import { signLiveSession } from '@tuturuuu/meet-core/features/live-assistant/token';
import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import { z } from 'zod';
import {
  MIRA_PRIVATE_NOTICE_VERSION,
  MIRA_ROOM_DENIED,
} from '@tuturuuu/realtime/meet';
import { readMiraDemoAuthority } from '../../../../features/live-assistant/server/demo-authority';
import {
  readPrivateMiraChoice,
  requirePrivateMiraChoice,
} from '../../../../features/live-assistant/server/private-consent';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('policy') }),
  z.object({
    action: z.literal('choice'),
    choice: z.enum(['continue', 'mute', 'leave']),
    version: z.literal(MIRA_PRIVATE_NOTICE_VERSION),
  }),
  z.object({
    action: z.literal('start'),
    audioPolicy: z.literal('participant-opt-in').optional(),
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
    const command = input.data;
    if (command.action === 'start' && command.mode !== 'personal')
      throw new MeetCallAccessError(403, MIRA_ROOM_DENIED);
    const cloudflare = await getCloudflareContext({ async: true });
    const env = cloudflare.env as unknown as {
      MEET_LIVE: DurableObjectNamespace;
      MEET_REALTIME_TOKEN_SECRET: string;
      GOOGLE_GENERATIVE_AI_API_KEY?: string;
      MEET_AI_DISABLED?: string;
    };
    if (command.action === 'choice') {
      const current = await readPrivateMiraChoice(access);
      if (command.choice !== 'continue') {
        for (const sessionId of current.sessions) {
          if (!env.MEET_LIVE)
            throw new MeetCallAccessError(
              503,
              'Private Mira stop is unavailable'
            );
          const response = await env.MEET_LIVE.get(
            env.MEET_LIVE.idFromName(sessionId)
          ).fetch('https://live.internal/control', {
            method: 'POST',
            body: JSON.stringify({
              action: 'stop',
              ownerId: access.user.id,
              meetingId,
            }),
          });
          if (!response.ok && response.status !== 410)
            throw new MeetCallAccessError(503, 'Private Mira could not stop');
          await callRoomService(access, {
            action: 'mira.private.ended',
            sessionId,
          });
        }
      }
      return callRoomService(access, {
        action: 'mira.private.choice',
        choice: command.choice,
        version: command.version,
      });
    }
    const currentChoice =
      command.action === 'stop'
        ? undefined
        : await readPrivateMiraChoice(access);
    const authority =
      command.action === 'stop'
        ? undefined
        : await readMiraDemoAuthority({
            accountId: access.user.id,
            workspaceId: access.meeting.ws_id,
            meetingId,
            workspaceMember: access.canReadWorkspace,
            admitted: currentChoice?.admitted === true,
            disabledBinding: env.MEET_AI_DISABLED,
          });
    if (command.action === 'policy')
      return {
        ...currentChoice,
        available:
          authority?.allowed === true &&
          !!env.MEET_LIVE &&
          !!env.GOOGLE_GENERATIVE_AI_API_KEY,
      };
    if (command.action !== 'stop' && !authority?.allowed)
      throw new MeetCallAccessError(403, 'Meet AI is temporarily unavailable');
    if (
      !env.MEET_LIVE ||
      (command.action !== 'stop' && !env.GOOGLE_GENERATIVE_AI_API_KEY)
    )
      throw new MeetCallAccessError(503, 'Live assistant is unavailable');
    const consent =
      command.action === 'stop'
        ? undefined
        : await requirePrivateMiraChoice(access);
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
      if (
        claims.mode !== 'personal' ||
        claims.ownerId !== access.user.id ||
        claims.meetingId !== meetingId ||
        claims.consentVersion !== consent?.version ||
        claims.consentRevision !== consent?.revision
      )
        throw new MeetCallAccessError(
          403,
          'Private Mira session is unavailable'
        );
      return {
        sessionId: claims.sessionId,
        token: signLiveSession(
          { ...claims, expiresAt: Date.now() + 120000 },
          env.MEET_REALTIME_TOKEN_SECRET
        ),
        mode: claims.mode,
        ownerId: claims.ownerId,
      };
    }
    // Personal "Talk to Mira" stays on the actor's personal credits; only the
    // room assistant (meeting transcription/notes) bills the meeting workspace.
    const billingWorkspaceId = await personalWorkspace(access.user.id);
    const claims: LiveSessionClaims = {
      audioPolicy: command.audioPolicy,
      inputSource: 'private-microphone',
      consentVersion: consent!.version,
      consentRevision: consent!.revision,
      workspaceAuthority: authority!.allowed ? authority!.authority : undefined,
      audience: 'meet-live',
      app: MEETING_APP,
      sessionId: crypto.randomUUID(),
      meetingId,
      ownerId: access.user.id,
      billingWorkspaceId,
      mode: command.mode,
      expiresAt: Date.now() + 120000,
    };
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
            voice: command.voice,
            identity: {
              workspaceId: access.meeting.ws_id,
              isHost: access.isHost,
              displayName: access.displayName,
            },
            timezone: command.timezone,
            scenarioInstructions: undefined,
            sharedContext: '',
          }),
        }
      );
      if (!initialized.ok)
        throw new MeetCallAccessError(503, 'Assistant session unavailable');
      await callRoomService(access, {
        action: 'mira.private.register',
        sessionId: claims.sessionId,
      });
      const confirmedConsent = await requirePrivateMiraChoice(access);
      if (confirmedConsent.revision !== consent!.revision)
        throw new MeetCallAccessError(403, 'Private Mira choice changed');
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
    } catch (error) {
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
      await callRoomService(access, {
        action: 'mira.private.ended',
        sessionId: claims.sessionId,
      }).catch(() => undefined);
      await Promise.allSettled([
        registry.fetch('https://live.internal/registry/remove', {
          method: 'POST',
          body: JSON.stringify(claims),
        }),
      ]);
      // Initialization arms a durable alarm. If this immediate stop fails,
      // that alarm closes the unconnected session and retries both cleanups.
      throw error;
    }
    return {
      sessionId: claims.sessionId,
      ownerId: claims.ownerId,
      mode: claims.mode,
      token: signLiveSession(claims, env.MEET_REALTIME_TOKEN_SECRET),
    };
  });
}
