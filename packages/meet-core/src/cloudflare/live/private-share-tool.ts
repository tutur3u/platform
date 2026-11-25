import { z } from 'zod';
import {
  readLiveMiraConfirmedAt,
  requireCurrentPrivateGrant,
} from './private-grant';
import { liveRoomCommand } from './room';
import type { SavedSession } from './session-state';
import type { LiveEnvironment } from './storage';
import { liveWorkspaceAllowed } from './workspace-gate';

const sharedNotes = z.strictObject({
  tutor: z
    .array(
      z.strictObject({
        assistant: z.boolean(),
        body: z.string().max(2000),
      })
    )
    .max(12),
  sharedAt: z.number(),
});

/** Polls stay drafts under the redesign; only a host or co-host launches. */
export function liveMiraPublishesPolls(
  env: Pick<LiveEnvironment, 'MEET_UX_V2'>,
  saved: Pick<SavedSession, 'claims'>
) {
  return !(env.MEET_UX_V2 === 'true' && saved.claims.app === 'meet');
}

/**
 * Reads what the session owner shared with their own Private Mira for this
 * meeting. The room checks the owner's live grant, this session's private
 * registration and the private scope on every call, so a revoke applies to
 * the next read. Room Mira and other people's sessions are refused.
 */
export async function readSharedPrivateNotes(
  env: LiveEnvironment,
  saved: SavedSession
): Promise<Record<string, unknown>> {
  const unavailable = {
    error: 'This person has not shared their tutor chat in this meeting',
  };
  if (
    env.MEET_UX_V2 !== 'true' ||
    saved.claims.app !== 'meet' ||
    saved.claims.mode !== 'personal' ||
    saved.ended ||
    saved.billingFinalized ||
    !liveWorkspaceAllowed(env, saved)
  )
    return unavailable;
  try {
    // Under the redesign this also requires the owner's adult account
    // confirmation, so unconfirmed and under-18 accounts never get here.
    await requireCurrentPrivateGrant(env, saved);
    const shared = sharedNotes.parse(
      await liveRoomCommand(env, saved.claims, saved.identity, {
        action: 'mira.share.private.read',
        sessionId: saved.claims.sessionId,
      })
    );
    // A share turned on before the owner's latest Mira confirmation needs a
    // fresh opt-in, so it is revoked instead of read.
    const confirmedAt = await readLiveMiraConfirmedAt(
      env,
      saved.claims.ownerId
    );
    if (confirmedAt === null || shared.sharedAt < confirmedAt) {
      await liveRoomCommand(env, saved.claims, saved.identity, {
        action: 'mira.share.set',
        enabled: false,
      }).catch(() => undefined);
      return unavailable;
    }
    return { tutor: shared.tutor };
  } catch {
    return unavailable;
  }
}
