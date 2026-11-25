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
  /** Whether the caller currently shares tutor chat with Private Mira. */
  shared: z.boolean().optional(),
  /** When that share was turned on. */
  sharedAt: z.number().optional(),
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

type ChoiceWrite =
  | { action: 'mira.private.initialize'; version: string }
  | {
      action: 'mira.private.choice';
      choice: 'continue' | 'mute' | 'leave';
      version: string;
    };

/**
 * Records the caller's Private Mira choice. The room can record it and still
 * fail to answer (a reply lost to a timeout or a dropped connection), which
 * would leave a recorded Continue that the client was told failed. So on any
 * failure other than the room's own refusal, the choice is read back: when
 * the room holds the requested choice, that recorded state is returned, and
 * otherwise the failure stands. The write is idempotent in the room.
 */
export async function recordPrivateMiraChoice(
  access: Access,
  write: ChoiceWrite
) {
  try {
    return await callRoomService(access, write);
  } catch (error) {
    if (error instanceof MeetCallAccessError && error.status < 500) throw error;
    const wanted =
      write.action === 'mira.private.initialize' ? 'continue' : write.choice;
    const recorded = await readPrivateMiraChoice(access).catch(() => undefined);
    const choice = recorded?.choice;
    if (
      choice?.choice === wanted &&
      choice.version === write.version &&
      choice.accountId === access.user.id &&
      choice.meetingId === access.meeting.id
    )
      return recorded;
    throw error;
  }
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
  return {
    choice: current.choice,
    shared: current.shared === true,
    sharedAt: current.sharedAt,
  };
}

export async function requirePrivateMiraChoice(access: Access) {
  return (await requirePrivateMiraChoiceState(access)).choice;
}
