/** What a call knows when it decides which whiteboard to offer. */
export interface WhiteboardPolicyInput {
  /** Meet UX v2, with its one Whiteboard entry. */
  merged: boolean;
  /** The server's `MEET_GUEST_WHITEBOARD` switch. */
  guestWhiteboard: boolean;
  /**
   * This person is outside the workspace: an anonymous guest or a signed-in
   * non-member. The server holds both to the guest whiteboard switch.
   */
  requiresAccount: boolean;
  /** Someone in the room is outside the workspace (`isOutsideWorkspace`). */
  guestsPresent: boolean;
}

/** A room participant the server holds to the guest whiteboard switch. */
export const isOutsideWorkspace = (person: {
  guest?: boolean;
  external?: boolean;
}) => !!(person.guest || person.external);

export interface WhiteboardPolicy {
  /** The Tuturuuu Whiteboard is listed for this person. */
  offerBoard: boolean;
  /** The guest may open the Tuturuuu Whiteboard pane instead of sign-in. */
  guestBoard: boolean;
  /**
   * The merged Whiteboard opens the pen board first, because a guest in the
   * room could not open the Tuturuuu Whiteboard.
   */
  penBoardFirst: boolean;
}

/**
 * Which whiteboard a person gets. Without Meet UX v2 nothing changes: the
 * board is listed and guests see the sign-in state. With it, guests use the
 * Tuturuuu Whiteboard only while the server switch is on; while it is off,
 * guests are offered the pen board, and so is everyone in a room with a guest,
 * so the room draws on one board.
 */
export function whiteboardPolicy({
  merged,
  guestWhiteboard,
  requiresAccount,
  guestsPresent,
}: WhiteboardPolicyInput): WhiteboardPolicy {
  if (!merged)
    return { offerBoard: true, guestBoard: false, penBoardFirst: false };
  if (requiresAccount)
    return {
      offerBoard: guestWhiteboard,
      guestBoard: guestWhiteboard,
      penBoardFirst: false,
    };
  return {
    offerBoard: true,
    guestBoard: false,
    penBoardFirst: guestsPresent && !guestWhiteboard,
  };
}
