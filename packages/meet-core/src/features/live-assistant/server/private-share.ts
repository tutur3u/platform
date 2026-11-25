import 'server-only';
import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import {
  MIRA_SHARE_MAX_CONTEXT_BYTES,
  MIRA_SHARE_MAX_TURNS,
} from '@tuturuuu/realtime/meet';
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
import {
  readPrivateMiraChoice,
  stopPrivateMiraSessions,
} from './private-consent';

type Access = SignedInMeetCallAccess;
export type PrivateMiraShare = { enabled: boolean; revision: number };

export const privateMiraShareCommand = z.strictObject({
  action: z.literal('share'),
  enabled: z.boolean(),
  expectedActorId: z.uuid(),
});
const shareView = z.object({
  enabled: z.boolean(),
  revision: z.number().int().nonnegative(),
});
const off: PrivateMiraShare = { enabled: false, revision: 0 };

function isGuest(access: Access) {
  return 'guest' in access && access.guest === true;
}

/** The caller's own share, or off whenever it cannot be confirmed. */
export async function readPrivateMiraShare(
  access: Access
): Promise<PrivateMiraShare | undefined> {
  if (!usesMiraAccountConfirmation()) return undefined;
  if (isGuest(access)) return off;
  const result = shareView.safeParse(
    await callRoomService(access, { action: 'mira.share.read' }).catch(
      () => null
    )
  );
  return result.success ? result.data : off;
}

/**
 * Turns the caller's own share on or off. The room keys the grant by the
 * signed-in account, so nobody can grant or revoke for someone else. Turning
 * it on needs a confirmed adult account; turning it off never waits for that.
 * Revoking also ends the caller's Private Mira voice sessions, so nothing a
 * session already read stays in a live model conversation.
 */
export async function setPrivateMiraShare(
  access: Access,
  command: z.infer<typeof privateMiraShareCommand>,
  live?: DurableObjectNamespace
): Promise<PrivateMiraShare> {
  if (!usesMiraAccountConfirmation())
    throw new MeetCallAccessError(404, 'Private Mira sharing is unavailable');
  if (isGuest(access) || command.expectedActorId !== access.user.id)
    throw new MeetCallAccessError(403, 'Private Mira account changed');
  if (command.enabled) await requireMiraAccountConfirmation(access);
  const result = shareView.safeParse(
    await callRoomService(access, {
      action: 'mira.share.set',
      enabled: command.enabled,
    })
  );
  if (!result.success)
    throw new MeetCallAccessError(503, 'Private Mira sharing is unavailable');
  // A grant that ever existed may have been read; a retry stops again.
  if (!command.enabled && result.data.revision > 0) {
    const { sessions } = await readPrivateMiraChoice(access);
    await stopPrivateMiraSessions(access, sessions, live);
  }
  return result.data;
}

/**
 * Hands the owner's latest tutor chat to their room share. The room accepts
 * it only while the owner's grant is on, so this is a no-op otherwise.
 */
export async function forwardSharedTutorChat(
  access: Access,
  turns: readonly { body: string; assistant: boolean }[]
) {
  if (!usesMiraAccountConfirmation() || isGuest(access)) return;
  const tutor = turns
    .map(({ body, assistant }) => ({
      assistant,
      body: body.trim().slice(0, 2000),
    }))
    .filter(({ body }) => body.length > 0)
    .slice(-MIRA_SHARE_MAX_TURNS);
  // Drop the oldest turns until the room's size cap fits, with headroom.
  const encoder = new TextEncoder();
  while (
    tutor.length > 1 &&
    encoder.encode(JSON.stringify(tutor)).byteLength >
      MIRA_SHARE_MAX_CONTEXT_BYTES - 1000
  )
    tutor.shift();
  try {
    await requireMiraAccountConfirmation(access);
    await callRoomService(access, { action: 'mira.share.context', tutor });
  } catch {
    // Not shared, revoked, or unconfirmed: nothing leaves the tutor chat.
  }
}
