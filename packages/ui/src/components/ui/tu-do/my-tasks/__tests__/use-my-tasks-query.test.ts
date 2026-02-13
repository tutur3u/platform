import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ──────────────────────────────────────────────────────────
const { mockUseQuery, mockUseInfiniteQuery } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockUseInfiniteQuery: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useInfiniteQuery: (...args: unknown[]) => mockUseInfiniteQuery(...args),
  keepPreviousData: Symbol('keepPreviousData'),
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ── Import after mocks ─────────────────────────────────────────────────────
import type { TaskFilterParams } from '../use-my-tasks-query.js';
import {
  MY_COMPLETED_TASKS_QUERY_KEY,
  MY_TASKS_QUERY_KEY,
  useCompletedTasksQuery,
  useMyTasksQuery,
} from '../use-my-tasks-query.js';

// ── Helpers ────────────────────────────────────────────────────────────────
/** Capture the options object passed to useQuery / useInfiniteQuery */
function captureUseQueryOptions() {
  const call = mockUseQuery.mock.calls.at(-1);
  return call?.[0] as Record<string, any>;
}

function captureUseInfiniteQueryOptions() {
  const call = mockUseInfiniteQuery.mock.calls.at(-1);
  return call?.[0] as Record<string, any>;
}

/** Call the hook so the mock records the options, then return captured opts. */
function callMyTasksQuery(
  wsId: string,
  isPersonal: boolean,
  filters?: TaskFilterParams
) {
  useMyTasksQuery(wsId, isPersonal, filters);
  return captureUseQueryOptions();
}

function callCompletedTasksQuery(
  wsId: string,
  isPersonal: boolean,
  filters?: TaskFilterParams
) {
  useCompletedTasksQuery(wsId, isPersonal, filters);
  return captureUseInfiniteQueryOptions();
}

// ════════════════════════════════════════════════════════════════════════════
describe('useMyTasksQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });
    mockUseInfiniteQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
    });
  });

  // ── Query key ────────────────────────────────────────────────────────────
  it('passes correct queryKey with wsId, isPersonal, and filters', async () => {
    const filters: TaskFilterParams = {
      workspaceIds: ['all'],
      boardIds: ['all'],
      labelIds: [],
      projectIds: [],
      selfManagedOnly: false,
    };

    const opts = callMyTasksQuery('ws-1', true, filters);

    expect(opts.queryKey).toEqual([MY_TASKS_QUERY_KEY, 'ws-1', true, filters]);
  });

  // ── Query config ─────────────────────────────────────────────────────────
  it('sets staleTime to 30_000 and refetchOnWindowFocus to true', async () => {
    const opts = callMyTasksQuery('ws-1', false);

    expect(opts.staleTime).toBe(30_000);
    expect(opts.refetchOnWindowFocus).toBe(true);
  });

  it('uses keepPreviousData as placeholderData', async () => {
    const opts = callMyTasksQuery('ws-1', false);

    // Our mock replaces keepPreviousData with a Symbol
    expect(opts.placeholderData).toBeDefined();
  });

  // ── URL construction ─────────────────────────────────────────────────────
  describe('queryFn URL construction', () => {
    it('builds base URL with wsId and isPersonal', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const opts = callMyTasksQuery('ws-1', true);
      await opts.queryFn();

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      const params = new URLSearchParams(calledUrl.split('?')[1]!);

      expect(calledUrl).toContain('/api/v1/users/me/tasks?');
      expect(params.get('wsId')).toBe('ws-1');
      expect(params.get('isPersonal')).toBe('true');
    });

    it('skips "all" sentinel for workspaceIds and boardIds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const filters: TaskFilterParams = {
        workspaceIds: ['all'],
        boardIds: ['all'],
        labelIds: [],
        projectIds: [],
        selfManagedOnly: false,
      };

      const opts = callMyTasksQuery('ws-1', true, filters);
      await opts.queryFn();

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      const params = new URLSearchParams(calledUrl.split('?')[1]!);

      expect(params.getAll('filterWsId')).toEqual([]);
      expect(params.getAll('filterBoardId')).toEqual([]);
    });

    it('appends non-"all" workspace and board IDs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const filters: TaskFilterParams = {
        workspaceIds: ['ws-a', 'ws-b'],
        boardIds: ['board-1'],
        labelIds: [],
        projectIds: [],
        selfManagedOnly: false,
      };

      const opts = callMyTasksQuery('ws-1', false, filters);
      await opts.queryFn();

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      const params = new URLSearchParams(calledUrl.split('?')[1]!);

      expect(params.getAll('filterWsId')).toEqual(['ws-a', 'ws-b']);
      expect(params.getAll('filterBoardId')).toEqual(['board-1']);
    });

    it('appends label and project IDs without filtering', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const filters: TaskFilterParams = {
        workspaceIds: ['all'],
        boardIds: ['all'],
        labelIds: ['label-1', 'label-2'],
        projectIds: ['proj-1'],
        selfManagedOnly: false,
      };

      const opts = callMyTasksQuery('ws-1', false, filters);
      await opts.queryFn();

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      const params = new URLSearchParams(calledUrl.split('?')[1]!);

      expect(params.getAll('filterLabelId')).toEqual(['label-1', 'label-2']);
      expect(params.getAll('filterProjectId')).toEqual(['proj-1']);
    });

    it('sets selfManagedOnly param when true', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const filters: TaskFilterParams = {
        workspaceIds: ['all'],
        boardIds: ['all'],
        labelIds: [],
        projectIds: [],
        selfManagedOnly: true,
      };

      const opts = callMyTasksQuery('ws-1', false, filters);
      await opts.queryFn();

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      const params = new URLSearchParams(calledUrl.split('?')[1]!);

      expect(params.get('selfManagedOnly')).toBe('true');
    });

    it('does not set selfManagedOnly when false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const filters: TaskFilterParams = {
        workspaceIds: ['all'],
        boardIds: ['all'],
        labelIds: [],
        projectIds: [],
        selfManagedOnly: false,
      };

      const opts = callMyTasksQuery('ws-1', false, filters);
      await opts.queryFn();

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      const params = new URLSearchParams(calledUrl.split('?')[1]!);

      expect(params.has('selfManagedOnly')).toBe(false);
    });

    it('combines all filter types in a single URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const filters: TaskFilterParams = {
        workspaceIds: ['ws-a', 'all'],
        boardIds: ['board-1', 'all'],
        labelIds: ['label-x'],
        projectIds: ['proj-y', 'proj-z'],
        selfManagedOnly: true,
      };

      const opts = callMyTasksQuery('ws-1', true, filters);
      await opts.queryFn();

      const calledUrl = mockFetch.mock.calls[0]![0] as string;
      const params = new URLSearchParams(calledUrl.split('?')[1]!);

      // 'all' is skipped
      expect(params.getAll('filterWsId')).toEqual(['ws-a']);
      expect(params.getAll('filterBoardId')).toEqual(['board-1']);
      expect(params.getAll('filterLabelId')).toEqual(['label-x']);
      expect(params.getAll('filterProjectId')).toEqual(['proj-y', 'proj-z']);
      expect(params.get('selfManagedOnly')).toBe('true');
    });
  });

  // ── Error handling ───────────────────────────────────────────────────────
  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const opts = callMyTasksQuery('ws-1', false);

    await expect(opts.queryFn()).rejects.toThrow('Failed to fetch tasks');
  });

  // ── No filters ───────────────────────────────────────────────────────────
  it('builds URL without filter params when no filters provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const opts = callMyTasksQuery('ws-1', false);
    await opts.queryFn();

    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    const params = new URLSearchParams(calledUrl.split('?')[1]!);

    expect(params.get('wsId')).toBe('ws-1');
    expect(params.get('isPersonal')).toBe('false');
    expect(params.getAll('filterWsId')).toEqual([]);
    expect(params.getAll('filterBoardId')).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('useCompletedTasksQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });
    mockUseInfiniteQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
    });
  });

  // ── Query key ────────────────────────────────────────────────────────────
  it('passes correct queryKey', async () => {
    const filters: TaskFilterParams = {
      workspaceIds: ['all'],
      boardIds: ['all'],
      labelIds: [],
      projectIds: [],
      selfManagedOnly: false,
    };

    const opts = callCompletedTasksQuery('ws-2', false, filters);

    expect(opts.queryKey).toEqual([
      MY_COMPLETED_TASKS_QUERY_KEY,
      'ws-2',
      false,
      filters,
    ]);
  });

  // ── Config ───────────────────────────────────────────────────────────────
  it('sets initialPageParam to 0 and staleTime to 30_000', async () => {
    const opts = callCompletedTasksQuery('ws-1', false);

    expect(opts.initialPageParam).toBe(0);
    expect(opts.staleTime).toBe(30_000);
    expect(opts.refetchOnWindowFocus).toBe(true);
  });

  // ── queryFn URL ──────────────────────────────────────────────────────────
  it('includes completedPage and completedLimit in URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        completed: [],
        hasMoreCompleted: false,
        completedPage: 2,
        totalCompletedTasks: 0,
      }),
    });

    const opts = callCompletedTasksQuery('ws-1', true);
    await opts.queryFn({ pageParam: 2 });

    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    const params = new URLSearchParams(calledUrl.split('?')[1]!);

    expect(params.get('completedPage')).toBe('2');
    expect(params.get('completedLimit')).toBe('20');
  });

  it('applies same filter logic as useMyTasksQuery', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        completed: [],
        hasMoreCompleted: false,
        completedPage: 0,
        totalCompletedTasks: 0,
      }),
    });

    const filters: TaskFilterParams = {
      workspaceIds: ['ws-a', 'all'],
      boardIds: ['board-1'],
      labelIds: ['label-1'],
      projectIds: ['proj-1'],
      selfManagedOnly: true,
    };

    const opts = callCompletedTasksQuery('ws-1', false, filters);
    await opts.queryFn({ pageParam: 0 });

    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    const params = new URLSearchParams(calledUrl.split('?')[1]!);

    expect(params.getAll('filterWsId')).toEqual(['ws-a']);
    expect(params.getAll('filterBoardId')).toEqual(['board-1']);
    expect(params.getAll('filterLabelId')).toEqual(['label-1']);
    expect(params.getAll('filterProjectId')).toEqual(['proj-1']);
    expect(params.get('selfManagedOnly')).toBe('true');
  });

  // ── Response normalization ───────────────────────────────────────────────
  it('normalizes response with defaults for missing fields', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}), // empty response
    });

    const opts = callCompletedTasksQuery('ws-1', false);
    const result = await opts.queryFn({ pageParam: 0 });

    expect(result).toEqual({
      completed: [],
      hasMoreCompleted: false,
      completedPage: 0,
      totalCompletedTasks: 0,
    });
  });

  it('passes through present fields', async () => {
    const serverData = {
      completed: [{ id: 'task-1', name: 'Done task' }],
      hasMoreCompleted: true,
      completedPage: 3,
      totalCompletedTasks: 42,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => serverData,
    });

    const opts = callCompletedTasksQuery('ws-1', false);
    const result = await opts.queryFn({ pageParam: 3 });

    expect(result).toEqual(serverData);
  });

  // ── Error handling ───────────────────────────────────────────────────────
  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const opts = callCompletedTasksQuery('ws-1', false);

    await expect(opts.queryFn({ pageParam: 0 })).rejects.toThrow(
      'Failed to fetch completed tasks'
    );
  });

  // ── getNextPageParam ─────────────────────────────────────────────────────
  it('returns next page when hasMoreCompleted is true', async () => {
    const opts = callCompletedTasksQuery('ws-1', false);

    const nextPage = opts.getNextPageParam({
      completed: [],
      hasMoreCompleted: true,
      completedPage: 2,
      totalCompletedTasks: 100,
    });

    expect(nextPage).toBe(3);
  });

  it('returns undefined when hasMoreCompleted is false', async () => {
    const opts = callCompletedTasksQuery('ws-1', false);

    const nextPage = opts.getNextPageParam({
      completed: [],
      hasMoreCompleted: false,
      completedPage: 5,
      totalCompletedTasks: 100,
    });

    expect(nextPage).toBeUndefined();
  });
});
