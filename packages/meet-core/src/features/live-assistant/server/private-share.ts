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
  readMiraConfirmedAt,
  requireMiraAccountConfirmation,
  usesMiraAccountConfirmation,
} from './account-confirmation';
import { stopPrivateMiraSessions } from './private-consent';

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
  sharedAt: z.number().optional(),
});
const revokeView = shareView.extend({
  sessions: z.array(z.uuid()).max(2).default([]),
});
const off: PrivateMiraShare = { enabled: false, revision: 0 };

function isGuest(access: Access) {
  return 'guest' in access && access.guest === true;
}

/**
 * A share turned on before the owner's latest Mira confirmation does not
 * count, so withdrawing and confirming again needs a fresh opt-in. A share
 * without a known start, or an account without a confirmation, fails closed.
 */
export async function sharePredatesConfirmation(
  access: Access,
  sharedAt: number | undefined
) {
  if (sharedAt === undefined) return true;
  const confirmedAt = await readMiraConfirmedAt(access.user.id);
  return confirmedAt === null || sharedAt < confirmedAt;
}

/** Turns off a share that no longer counts; best effort. */
async function dropStaleShare(access: Access) {
  await callRoomService(access, {
    action: 'mira.share.set',
    enabled: false,
  }).catch(() => {
    console.warn('Stale Private Mira share could not be revoked');
  });
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
  if (!result.success) return off;
  const { enabled, revision, sharedAt } = result.data;
  if (enabled && (await sharePredatesConfirmation(access, sharedAt))) {
    await dropStaleShare(access);
    return { enabled: false, revision };
  }
  return { enabled, revision };
}

/**
 * Revokes the caller's own share and ends every Private Mira voice session
 * the room has registered for them, admitted or not, so nothing a session
 * already read stays in a live model conversation. A retry stops them again.
 * With `always`, the sessions stop even when the caller never shared.
 */
export async function revokePrivateMiraShare(
  access: Access,
  live?: DurableObjectNamespace,
  options: { always?: boolean } = {}
): Promise<PrivateMiraShare> {
  const result = revokeView.safeParse(
    await callRoomService(access, { action: 'mira.share.set', enabled: false })
  );
  if (!result.success)
    throw new MeetCallAccessError(503, 'Private Mira sharing is unavailable');
  const { sessions, enabled, revision } = result.data;
  if (revision > 0 || options.always)
    await stopPrivateMiraSessions(access, sessions, live);
  return { enabled, revision };
}

/**
 * Turns the caller's own share on or off. The room keys the grant by the
 * signed-in account, so nobody can grant or revoke for someone else. Turning
 * it on needs a confirmed adult account; turning it off never waits for that.
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
  if (!command.enabled) return revokePrivateMiraShare(access, live);
  await requireMiraAccountConfirmation(access);
  const result = shareView.safeParse(
    await callRoomService(access, { action: 'mira.share.set', enabled: true })
  );
  if (!result.success)
    throw new MeetCallAccessError(503, 'Private Mira sharing is unavailable');
  return { enabled: result.data.enabled, revision: result.data.revision };
}

/**
 * Hands the owner's latest tutor chat to their room share. The room accepts
 * it only while the owner's grant is on, so this is a no-op otherwise. A
 * share older than the owner's latest confirmation is revoked instead.
 */
export async function forwardSharedTutorChat(
  access: Access,
  turns: readonly { body: string; assistant: boolean }[],
  sharedAt: number | undefined
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
    if (await sharePredatesConfirmation(access, sharedAt)) {
      await dropStaleShare(access);
      return;
    }
    await callRoomService(access, { action: 'mira.share.context', tutor });
  } catch {
    // Not shared, revoked, or unconfirmed: nothing leaves the tutor chat.
  }
}
