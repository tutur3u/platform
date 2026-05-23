import { describe, expect, it, vi } from 'vitest';
import {
  applyMindAiPatch,
  archiveMindBoard,
  createMindBoard,
  getMindBoardGraphSnapshot,
  getMindBoardSnapshot,
  listMindAiPatches,
  listMindBoards,
  saveMindGraph,
  searchMindNodes,
  updateMindBoard,
} from './mind';

describe('Mind internal API helpers', () => {
  it('uses workspace-scoped Mind endpoints with no-store requests', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          board: { id: 'board-1', title: 'Long arc' },
          boards: [],
          edges: [],
          groups: [],
          links: [],
          nodes: [],
          patches: [],
          tags: [],
        }),
        { status: 200 }
      );
    });

    await listMindBoards({ baseUrl: 'https://web.test', fetch: fetchMock });
    await createMindBoard(
      { title: 'Long arc' },
      { baseUrl: 'https://web.test', fetch: fetchMock }
    );
    await getMindBoardSnapshot('personal', 'board-1', {
      baseUrl: 'https://web.test',
      fetch: fetchMock,
    });
    await getMindBoardGraphSnapshot('personal', 'board-1', {
      baseUrl: 'https://web.test',
      fetch: fetchMock,
    });
    await updateMindBoard(
      'personal',
      'board-1',
      { title: 'Renamed arc' },
      {
        baseUrl: 'https://web.test',
        fetch: fetchMock,
      }
    );
    await archiveMindBoard('personal', 'board-1', {
      baseUrl: 'https://web.test',
      fetch: fetchMock,
    });
    await listMindAiPatches('personal', 'board-1', {
      baseUrl: 'https://web.test',
      fetch: fetchMock,
    });
    await saveMindGraph(
      'personal',
      'board-1',
      {
        deletedEdgeIds: [],
        deletedNodeIds: [],
        edges: [],
        nodes: [],
      },
      { baseUrl: 'https://web.test', fetch: fetchMock }
    );
    await searchMindNodes(
      'personal',
      { q: 'future', boardId: 'board-1' },
      { baseUrl: 'https://web.test', fetch: fetchMock }
    );
    await applyMindAiPatch('personal', 'patch-1', {
      baseUrl: 'https://web.test',
      fetch: fetchMock,
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://web.test/api/v1/workspaces/personal/mind/boards',
      'https://web.test/api/v1/workspaces/personal/mind/boards',
      'https://web.test/api/v1/workspaces/personal/mind/boards/board-1',
      'https://web.test/api/v1/workspaces/personal/mind/boards/board-1/graph',
      'https://web.test/api/v1/workspaces/personal/mind/boards/board-1',
      'https://web.test/api/v1/workspaces/personal/mind/boards/board-1',
      'https://web.test/api/v1/workspaces/personal/mind/boards/board-1/patches',
      'https://web.test/api/v1/workspaces/personal/mind/boards/board-1/graph',
      'https://web.test/api/v1/workspaces/personal/mind/search?q=future&boardId=board-1',
      'https://web.test/api/v1/workspaces/personal/mind/ai/patches/patch-1/apply',
    ]);
    expect(fetchMock.mock.calls.map(([, init]) => init?.cache)).toEqual([
      'no-store',
      'no-store',
      'no-store',
      'no-store',
      'no-store',
      'no-store',
      'no-store',
      'no-store',
      'no-store',
      'no-store',
    ]);
  });
});
