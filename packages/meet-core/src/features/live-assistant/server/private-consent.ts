import 'server-only';
import { MIRA_PRIVATE_NOTICE_VERSION } from '@tuturuuu/realtime/meet';
import { z } from 'zod';
import { MeetCallAccessError } from '../../call/lib/call-access';
import { callRoomService } from '../../call/server/room-service';

type Access = Parameters<typeof callRoomService>[0];
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
});

export async function readPrivateMiraChoice(access: Access) {
  const result = snapshot.safeParse(
    await callRoomService(access, { action: 'mira.private.read' })
  );
  if (!result.success)
    throw new MeetCallAccessError(403, 'Private Mira consent is unavailable');
  return result.data;
}

export async function requirePrivateMiraChoice(access: Access) {
  const current = await readPrivateMiraChoice(access);
  if (
    current.choice?.choice !== 'continue' ||
    current.choice.meetingId !== access.meeting.id ||
    current.choice.accountId !== access.user.id
  )
    throw new MeetCallAccessError(
      403,
      'Choose Continue with Mira before starting'
    );
  return current.choice;
}
