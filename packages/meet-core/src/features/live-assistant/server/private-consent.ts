import 'server-only';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { MIRA_PRIVATE_NOTICE_VERSION } from '@tuturuuu/realtime/meet';
import { z } from 'zod';
import { MeetCallAccessError } from '../../call/lib/call-access';
import {
  callRoomService,
  type SignedInMeetCallAccess,
} from '../../call/server/room-service';
import {
  requireMiraAccountConfirmation,
  usesMiraAccountConfirmation,
} from './account-confirmation';

type Access = SignedInMeetCallAccess;
const snapshot = z.object({
  version: z.literal(MIRA_PRIVATE_NOTICE_VERSION),
  admitted: z.literal(true),
  choice: z
    .object({
      choice: z.enum(['continue', 'mute', 'leave']),
      version: z.literal(MIRA_PRIVATE_NOTICE_VERSION),
      meetingId: z.string(),
      accountId: z.string(),
      recordedAt: z.number().int().positive(),
      revision: z.number().int().positive(),
    })
    .nullable(),
  sessions: z.array(z.uuid()).max(2),
  /** Whether the caller currently shares notes with their Private Mira. */
  shared: z.boolean().optional(),
});

export async function readPrivateMiraChoice(access: Access) {
  const result = snapshot.safeParse(
    await callRoomService(access, { action: 'mira.private.read' })
  );
  if (!result.success)
    throw new MeetCallAccessError(
      403,
      'Private Mira consent is unavailable',
      'MIRA_PRIVATE_CONSENT_UNAVAILABLE'
    );
  return result.data;
}

export async function stopPrivateMiraSessions(
  access: Access,
  sessions: readonly string[],
  binding?: DurableObjectNamespace
) {
  if (sessions.length === 0) return;
  const env = binding
    ? undefined
    : (await getCloudflareContext({ async: true })).env;
  const live =
    binding ??
    (env as { MEET_LIVE?: DurableObjectNamespace } | undefined)?.MEET_LIVE;
  if (!live)
    throw new MeetCallAccessError(503, 'Private Mira stop is unavailable');

  for (const sessionId of sessions) {
    const response = await live
      .get(live.idFromName(sessionId))
      .fetch('https://live.internal/control', {
        method: 'POST',
        body: JSON.stringify({
          action: 'stop',
          ownerId: access.user.id,
          meetingId: access.meeting.id,
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

/** The caller's Continue choice and whether they share with Private Mira. */
export async function requirePrivateMiraChoiceState(access: Access) {
  if (usesMiraAccountConfirmation())
    await requireMiraAccountConfirmation(access);
  const current = await readPrivateMiraChoice(access);
  if (
    current.choice?.choice !== 'continue' ||
    current.choice.meetingId !== access.meeting.id ||
    current.choice.accountId !== access.user.id
  )
    throw new MeetCallAccessError(
      403,
      'Choose Continue with Mira before starting',
      'MIRA_CONSENT_REQUIRED'
    );
  return { choice: current.choice, shared: current.shared === true };
}

export async function requirePrivateMiraChoice(access: Access) {
  return (await requirePrivateMiraChoiceState(access)).choice;
}
