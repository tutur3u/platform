import type {
  getWorkspaceTaskBoard,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { Workspace, WorkspaceProductTier } from '@tuturuuu/types';

type AuthorizedWorkspace = Workspace & {
  joined: boolean;
  tier: WorkspaceProductTier | null;
};
type AuthorizedBoard = Awaited<
  ReturnType<typeof getWorkspaceTaskBoard>
>['board'];
type BoardScope =
  | { access: 'member'; workspace: AuthorizedWorkspace }
  | {
      access: 'guest';
      workspace: Pick<Workspace, 'id' | 'personal'> & { tier: null };
    };

export async function loadTaskBoardPageModel({
  boardId,
  user,
  auth,
  getBoard,
  getWorkspace,
}: {
  boardId: string;
  user: { id: string } | null;
  auth: ReturnType<typeof withForwardedInternalApiAuth>;
  getBoard: (
    actor: { id: string },
    auth: ReturnType<typeof withForwardedInternalApiAuth>
  ) => Promise<AuthorizedBoard | null>;
  getWorkspace: (
    wsId: string,
    user: { id: string }
  ) => Promise<AuthorizedWorkspace | null>;
}) {
  if (!user?.id) return null;
  const board = await getBoard(user, auth);
  if (!board?.id || board.id !== boardId) return null;
  let scope: BoardScope;
  if (board.access_type === 'member') {
    const workspace = await getWorkspace(board.ws_id, user);
    if (!workspace || workspace.id !== board.ws_id || !workspace.joined)
      return null;
    scope = { access: 'member', workspace };
  } else {
    scope = {
      access: 'guest',
      workspace: { id: board.ws_id, personal: false, tier: null },
    };
  }
  return { boardId, board, currentUserId: user.id, ...scope };
}
