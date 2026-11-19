import { MeetCallAccessError } from '@tuturuuu/meet-core/features/call/lib/call-access';
import {
  getMeetRealtimeTokenSecret,
  getMeetRealtimeUrl,
} from '@tuturuuu/meet-core/features/call/lib/call-session';
import { resolveMeetClassRole } from '@tuturuuu/meet-core/features/call/server/class-role';
import { roomRoute } from '@tuturuuu/meet-core/features/call/server/room-service';
import {
  allowMeetActorAction,
  meetClassTimerEnabled,
} from '@tuturuuu/realtime/meet';
import {
  MEET_SERVICE_TTL_SECONDS,
  signMeetServiceCredential,
  type MeetServiceClaims,
} from '@tuturuuu/realtime/meet/service-credential';
import { connection } from 'next/server';
import { z } from 'zod';

const commandSchema = z
  .object({
    action: z.enum(['start', 'pause', 'resume', 'stop']),
    durationMs: z.number().int().optional(),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  await connection();
  if (!meetClassTimerEnabled()) return new Response(null, { status: 404 });
  const { meetingId } = await params;
  const command = commandSchema.parse(await request.json());
  return roomRoute(request, meetingId, async (access) => {
    const roomId = `${access.meeting.ws_id}:${access.meeting.id}`;
    if (!allowMeetActorAction('timer', access.user.id, roomId))
      throw new MeetCallAccessError(429, 'Too many requests');
    const classRole = await resolveMeetClassRole(access, { required: true });
    const actorRole = access.isHost
      ? 'host'
      : classRole.coHost
        ? 'cohost'
        : null;
    if (!actorRole)
      throw new MeetCallAccessError(403, 'Only the host can control the timer');
    if (command.action !== 'start' && actorRole !== 'host')
      throw new MeetCallAccessError(403, 'Only the host can control the timer');
    const claims: MeetServiceClaims = {
      aud: 'meet-service',
      purpose: 'class-timer',
      roomId,
      exp: Math.floor(Date.now() / 1000) + MEET_SERVICE_TTL_SECONDS,
      action: command.action,
      ...(command.durationMs === undefined
        ? {}
        : { durationMs: command.durationMs }),
      actorUserId: access.user.id,
      actorRole,
    };
    const endpoint = new URL(getMeetRealtimeUrl());
    endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
    endpoint.pathname = '/class-service';
    endpoint.search = '';
    const response = await fetch(endpoint, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${signMeetServiceCredential(
          claims,
          getMeetRealtimeTokenSecret()
        )}`,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 404)
      throw new MeetCallAccessError(404, 'Timer is unavailable');
    if (response.status === 429)
      throw new MeetCallAccessError(429, 'Too many requests');
    if (!response.ok)
      throw new MeetCallAccessError(403, 'Timer command was rejected');
    return { ok: true };
  });
}
