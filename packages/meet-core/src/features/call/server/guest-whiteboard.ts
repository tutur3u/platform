import 'server-only';
import { isGuestBoardDrawEnabled } from '@tuturuuu/realtime/meet/board-sync-access';

/**
 * Whether anonymous Meet guests may open the Tuturuuu Whiteboard linked to a
 * meeting. Off until the Worker var is the exact string `true`; while off the
 * whiteboard API refuses every anonymous guest and the call offers the pen
 * board instead.
 */
export function isMeetGuestWhiteboardEnabled() {
  return process.env.MEET_GUEST_WHITEBOARD === 'true';
}

/**
 * Whether people outside the workspace may draw on a linked board. Off until
 * the Worker var `MEET_GUEST_WHITEBOARD_DRAW` is the exact string `true`;
 * while off the whiteboard API mints them view tickets whatever the board's
 * guest access says, and the board room refuses their writes. The board room
 * reads the same variable on the Meet Realtime Worker, so drawing needs both.
 */
export function isMeetGuestWhiteboardDrawEnabled() {
  return isGuestBoardDrawEnabled(process.env.MEET_GUEST_WHITEBOARD_DRAW);
}
