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
  isMiraAccountMissing,
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
 * Whether a share still counts. One turned on before the owner's latest Mira
 * confirmation, or held by an account without one, is `stale`: withdrawing
 * and confirming again needs a fresh opt-in, so it is revoked. When the
 * share start or the confirmation cannot be read, it is `unknown`: off for
 * this request, but never revoked on the strength of an outage. A deleted
 * owner account is not an outage: the confirmation-unavailable refusal is
 * thrown instead.
 */
export async function shareStanding(
  access: Access,
  sharedAt: number | undefined
): Promise<'current' | 'stale' | 'unknown'> {
  if (sharedAt === undefined) return 'unknown';
  let confirmedAt: number | null;
  try {
    confirmedAt = await readMiraConfirmedAt(access.user.id);
  } catch (error) {
    if (isMiraAccountMissing(error)) throw error;
    return 'unknown';
  }
  return confirmedAt === null || sharedAt < confirmedAt ? 'stale' : 'current';
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
  if (!enabled) return { enabled, revision };
  const standing = await shareStanding(access, sharedAt);
  if (standing === 'stale') await dropStaleShare(access);
  return { enabled: standing === 'current', revision };
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
  const enable = async () => {
    const result = shareView.safeParse(
      await callRoomService(access, { action: 'mira.share.set', enabled: true })
    );
    if (!result.success)
      throw new MeetCallAccessError(503, 'Private Mira sharing is unavailable');
    return result.data;
  };
  let share = await enable();
  let standing = await shareStanding(access, share.sharedAt);
  if (standing === 'stale') {
    // The room keeps an older grant on; a fresh opt-in replaces it with a
    // new grant, revision and start.
    await callRoomService(access, { action: 'mira.share.set', enabled: false });
    share = await enable();
    standing = await shareStanding(access, share.sharedAt);
  }
  if (standing !== 'current')
    throw new MeetCallAccessError(503, 'Private Mira sharing is unavailable');
  return { enabled: share.enabled, revision: share.revision };
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
    const standing = await shareStanding(access, sharedAt);
    if (standing === 'stale') await dropStaleShare(access);
    if (standing !== 'current') return;
    await callRoomService(access, { action: 'mira.share.context', tutor });
  } catch {
    // Not shared, revoked, or unconfirmed: nothing leaves the tutor chat.
  }
}
