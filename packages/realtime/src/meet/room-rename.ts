import { takeActorRateLimit } from './actor-rate-limit';
import { attendancePatch, renameOpenAttendance } from './attendance-ledger';
import type { MeetClassFeatures } from './class-features';
import type { MeetRealtimeClientMessage } from './messages';
import type { MeetRealtimeTokenPayload } from './primitives';
import {
  getMeetDisplayName,
  type MeetRoomCommand,
  type MeetRoomOutcome,
  type MeetRoomSnapshot,
  meetPresenceMessage,
} from './room';
import { denied, outcome } from './room-outcome';

/** Renames one participant may make per minute; a profile save sends one. */
export const MEET_RENAMES_PER_MINUTE = 6;
export const RENAME_RATE_LIMITED = 'rename_rate_limited';
/** The host admitted this name from the lobby, so it stays for the meeting. */
export const DISPLAY_NAME_LOCKED = 'display_name_locked';

type RenameMessage = Extract<
  MeetRealtimeClientMessage,
  { type: 'participant.rename' }
>;

/**
 * Applies a participant's own display-name change to the live room. The
 * schema has already normalised and bounded the name, and the target is always
 * the authenticated sender. Guests and anyone admitted from the lobby keep the
 * name the host approved, matching `presence.join`.
 */
export function applyParticipantRename(
  state: MeetRoomSnapshot,
  message: RenameMessage,
  token: MeetRealtimeTokenPayload,
  classFeatures: MeetClassFeatures
): MeetRoomOutcome {
  const { roomId, userId } = token;
  const existing = state.presence[userId];
  if (!existing) return denied(state, 'awaiting_admission', message.requestId);
  if (token.guest || existing.guest || token.admission === 'lobby')
    return denied(state, DISPLAY_NAME_LOCKED, message.requestId);
  const renamed = {
    displayName: message.displayName,
    requestId: message.requestId,
    type: 'participant.renamed' as const,
    userId,
  };
  if (existing.displayName === message.displayName)
    return outcome(state, { reply: [renamed] });
  const attendance = classFeatures.attendance
    ? renameOpenAttendance(state.attendance, userId, message.displayName)
    : undefined;
  const next: MeetRoomSnapshot = {
    ...state,
    ...(attendance ? attendancePatch(state, attendance) : {}),
    presence: {
      ...state.presence,
      [userId]: { ...existing, displayName: message.displayName },
    },
  };
  return outcome(next, {
    broadcast: [meetPresenceMessage(next, roomId)],
    reply: [renamed],
  });
}

/** One rename bucket per participant and room, shared by both rename paths. */
export function takeRenameAllowance(token: MeetRealtimeTokenPayload) {
  return takeActorRateLimit(
    `participant.rename:${token.roomId}:${token.userId}`,
    MEET_RENAMES_PER_MINUTE,
    60_000
  );
}

/**
 * `presence.join` renames an admitted participant who joined without the
 * lobby, so a join that would change their name spends the same allowance as
 * `participant.rename`. First joins, lobby joins and same-name rejoins stay
 * free. Over the limit the join still applies, keeping the current name, and
 * the sender is told why.
 */
export function limitPresenceJoinRename(
  state: MeetRoomSnapshot,
  command: MeetRoomCommand
): {
  command: MeetRoomCommand;
  reply: [] | [{ type: 'error'; error: string }];
} {
  const { message, token } = command;
  if (message.type !== 'presence.join' || token.admission === 'lobby')
    return { command, reply: [] };
  const existing = state.presence[token.userId];
  if (!existing || state.waiting[token.userId]) return { command, reply: [] };
  const next = getMeetDisplayName({
    ...token,
    displayName: message.displayName || token.displayName,
  });
  if (next === existing.displayName || takeRenameAllowance(token))
    return { command, reply: [] };
  return {
    command: {
      ...command,
      message: { ...message, displayName: existing.displayName },
    },
    reply: [{ type: 'error', error: RENAME_RATE_LIMITED }],
  };
}
