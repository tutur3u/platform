import type { BoardGuestAccess, BoardRole } from './board-sync-schema';

export type BoardActor =
  | { kind: 'member'; workspaceMember: boolean }
  | { kind: 'guest' };

/**
 * The role an actor may hold on a linked board, or null for no access.
 * Members must hold a live workspace `MEMBER` membership. Everyone else in the
 * room (anonymous guests and signed-in non-members) is capped by the link's
 * `guest_access`.
 */
export function boardRoleFor(
  actor: BoardActor,
  guestAccess: BoardGuestAccess
): BoardRole | null {
  if (actor.kind === 'member' && actor.workspaceMember) return 'edit';
  if (guestAccess === 'draw') return 'edit';
  if (guestAccess === 'view') return 'view';
  return null;
}

export type BoardOpenRefusal =
  | 'link-missing'
  | 'board-missing'
  | 'board-archived'
  | 'workspace-mismatch';

export interface BoardOpenFacts {
  /** The `private.meet_whiteboards` row for the meeting and board, if any. */
  link: { ws_id: string; guest_access: BoardGuestAccess } | null;
  /** The `workspace_whiteboards` row, if any. */
  board: { ws_id: string; archived_at: string | null } | null;
  meetingWsId: string;
}

/** Opening requires the link, an active board and one workspace across all three. */
export function checkBoardOpen(
  facts: BoardOpenFacts
):
  | { ok: true; guestAccess: BoardGuestAccess }
  | { ok: false; reason: BoardOpenRefusal } {
  if (!facts.link) return { ok: false, reason: 'link-missing' };
  if (!facts.board) return { ok: false, reason: 'board-missing' };
  if (facts.board.archived_at) return { ok: false, reason: 'board-archived' };
  if (
    facts.link.ws_id !== facts.meetingWsId ||
    facts.board.ws_id !== facts.meetingWsId
  )
    return { ok: false, reason: 'workspace-mismatch' };
  return { ok: true, guestAccess: facts.link.guest_access };
}

/** A refresh may change the role, never the actor or the board. */
export function sameBoardSession(
  current: { meetingId: string; boardId: string; userId: string; wsId: string },
  next: { meetingId: string; boardId: string; userId: string; wsId: string }
) {
  return (
    current.meetingId === next.meetingId &&
    current.boardId === next.boardId &&
    current.userId === next.userId &&
    current.wsId === next.wsId
  );
}

/** Terminal platform answers: the board is gone for good, so the room stops flushing. */
export function isTerminalCheckpointStatus(status: number) {
  return status === 403 || status === 404 || status === 410;
}
