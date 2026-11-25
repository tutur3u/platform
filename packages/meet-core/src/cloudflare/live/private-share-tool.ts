import { z } from 'zod';
import { requireCurrentPrivateGrant } from './private-grant';
import { liveRoomCommand } from './room';
import type { SavedSession } from './session-state';
import type { LiveEnvironment } from './storage';

const sharedNotes = z.strictObject({
  tutor: z
    .array(
      z.strictObject({
        assistant: z.boolean(),
        body: z.string().max(2000),
      })
    )
    .max(12),
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
    error: 'This person has not shared notes with you in this meeting',
  };
  if (
    env.MEET_UX_V2 !== 'true' ||
    saved.claims.app !== 'meet' ||
    saved.claims.mode !== 'personal' ||
    saved.ended ||
    saved.billingFinalized
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
    return { tutor: shared.tutor };
  } catch {
    return unavailable;
  }
}
