import 'server-only';

/**
 * Whether anonymous Meet guests may open the Tuturuuu Whiteboard linked to a
 * meeting. Off until the Worker var is the exact string `true`; while off the
 * whiteboard API refuses every anonymous guest and the call offers the pen
 * board instead.
 */
export function isMeetGuestWhiteboardEnabled() {
  return process.env.MEET_GUEST_WHITEBOARD === 'true';
}
