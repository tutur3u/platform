import { liveRoomCommand } from './room';
import type { SavedSession } from './session-state';
import type { LiveEnvironment } from './storage';

export async function requireCurrentPrivateGrant(
  env: LiveEnvironment,
  saved: SavedSession
) {
  const result = await liveRoomCommand<{
    choice?: {
      choice: string;
      accountId: string;
      meetingId: string;
      version: string;
      revision: number;
    } | null;
  }>(env, saved.claims, saved.identity, { action: 'mira.private.read' });
  const choice = result.choice;
  if (
    saved.claims.mode !== 'personal' ||
    !choice ||
    choice.choice !== 'continue' ||
    choice.accountId !== saved.claims.ownerId ||
    choice.meetingId !== saved.claims.meetingId ||
    choice.version !== saved.claims.consentVersion ||
    choice.revision !== saved.claims.consentRevision
  )
    throw new Error('Private Mira choice is unavailable');
}
