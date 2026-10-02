import {
  InternalApiError,
  listWorkspaces,
  listWorkspaceTaskBoards,
} from '@tuturuuu/internal-api';

/** Canonical aggregation: Hidden choices do not remove task data. */
export async function loadCanonicalWorkspaceBoardCatalog() {
  const workspaces = await listWorkspaces();
  const fetchAllWorkspaceBoards = async (workspaceId: string) => {
    const pageSize = 200;
    const boards: Awaited<
      ReturnType<typeof listWorkspaceTaskBoards>
    >['boards'] = [];
    let page = 1;

    try {
      while (true) {
        const payload = await listWorkspaceTaskBoards(workspaceId, {
          page,
          pageSize,
          status: 'all',
        });
        const pageBoards = payload.boards ?? [];
        boards.push(...pageBoards);
        if (pageBoards.length < pageSize) break;
        page += 1;
      }
    } catch (error) {
      if (error instanceof InternalApiError && error.status === 403) {
        return [];
      }
      throw error;
    }

    return boards;
  };
  const boardGroups = await Promise.all(
    workspaces.map((workspace) => fetchAllWorkspaceBoards(workspace.id))
  );

  return boardGroups
    .flat()
    .filter((board) => !board.deleted_at)
    .map((board) => ({
      id: board.id,
      name: board.name,
      ws_id: board.ws_id,
    }));
}
