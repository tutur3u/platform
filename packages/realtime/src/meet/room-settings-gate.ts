import {
  isMeetAiEnabledForWorkspace,
  type MeetAiGateEnv,
} from './ai-workspace-gate';
import type { MeetRealtimeClientMessage } from './messages';
import type { MeetRealtimeTokenPayload } from './primitives';
import type { MeetRoomCommand } from './room';
import { enablesNoteSharing } from './room-controls';
import {
  type MeetRoomSettings,
  parseMeetRoomSettingsPatch,
} from './room-options';

/**
 * The authoritative room-state settings write. Only the host may patch, and
 * turning note sharing on follows the Meet AI workspace gate (default deny);
 * turning it off is always allowed.
 */
export function resolveRoomSettingsPatch(
  body: unknown,
  current: MeetRoomSettings | undefined,
  token: MeetRealtimeTokenPayload,
  env: MeetAiGateEnv
): MeetRoomSettings | Response {
  if (token.role !== 'host') return new Response('Forbidden', { status: 403 });
  const patch = parseMeetRoomSettingsPatch(body, current);
  if (!patch.success) return new Response('Invalid settings', { status: 400 });
  if (
    enablesNoteSharing(body as Parameters<typeof enablesNoteSharing>[0]) &&
    !isMeetAiEnabledForWorkspace(token.wsId, env)
  )
    return new Response('Meeting AI is not available', { status: 403 });
  return patch.data;
}

/** A room command carrying the workspace's Meet AI eligibility for the host controls. */
export function roomCommand(
  message: MeetRealtimeClientMessage,
  token: MeetRealtimeTokenPayload,
  env: MeetAiGateEnv
): MeetRoomCommand {
  return {
    message,
    now: new Date().toISOString(),
    token,
    notesEligible: isMeetAiEnabledForWorkspace(token.wsId, env),
  };
}
