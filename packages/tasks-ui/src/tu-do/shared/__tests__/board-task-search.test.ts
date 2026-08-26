import type { ListWorkspaceTasksOptions } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildTaskSearchQueryVariants,
  getBoardTaskIdentifier,
  getTicketIdentifierSearchQuery,
  listBoardTaskCountsForSearch,
  listBoardTasksForSearch,
  mergeListCountsByListId,
  mergeTasksById,
  taskMatchesBoardSearch,
} from '../board-task-search';

const listWorkspaceTasksMock = vi.hoisted(() => vi.fn());

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  listWorkspaceTasks: listWorkspaceTasksMock,
}));

function buildTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    assignees: [],
    created_at: '2026-03-07T00:00:00.000Z',
    display_number: 1,
    end_date: null,
    labels: [],
    list_id: 'list-1',
    name: 'Ship timeline revamp',
    priority: 'normal',
    sort_key: 1,
    start_date: undefined,
    ...overrides,
  } as Task;
}

beforeEach(() => {
  listWorkspaceTasksMock.mockReset();
});

describe('getTicketIdentifierSearchQuery', () => {
  it('accepts bare display numbers', () => {
    expect(getTicketIdentifierSearchQuery('115')).toBe('115');
  });

  it('accepts prefixed ticket identifiers', () => {
    expect(getTicketIdentifierSearchQuery('DEV-115')).toBe('DEV-115');
  });

  it('trims surrounding whitespace', () => {
    expect(getTicketIdentifierSearchQuery('  dev-115  ')).toBe('dev-115');
  });

  it('rejects plain text, empty input, and malformed identifiers', () => {
    expect(getTicketIdentifierSearchQuery('login')).toBeNull();
    expect(getTicketIdentifierSearchQuery('')).toBeNull();
    expect(getTicketIdentifierSearchQuery('   ')).toBeNull();
    expect(getTicketIdentifierSearchQuery(undefined)).toBeNull();
    expect(getTicketIdentifierSearchQuery('115-abc')).toBeNull();
  });
});

describe('getBoardTaskIdentifier', () => {
  it('prefers the task prefix over the board prefix', () => {
    const task = buildTask({
      display_number: 115,
      id: 'task-1',
      ticket_prefix: 'DEV',
    } as Partial<Task> & { id: string });

    expect(getBoardTaskIdentifier(task, 'RD')).toBe('DEV-115');
  });

  it('falls back to the board prefix', () => {
    const task = buildTask({ display_number: 115, id: 'task-1' });

    expect(getBoardTaskIdentifier(task, 'RD')).toBe('RD-115');
  });

  it('falls back to TASK when neither prefix is set', () => {
    const task = buildTask({ display_number: 115, id: 'task-1' });

    expect(getBoardTaskIdentifier(task, null)).toBe('TASK-115');
  });

  it('returns null instead of composing a null display number', () => {
    const task = buildTask({
      display_number: null as unknown as number,
      id: 'task-1',
    });

    expect(getBoardTaskIdentifier(task, 'RD')).toBeNull();
  });
});

describe('taskMatchesBoardSearch', () => {
  it('matches names, display numbers, and board ticket identifiers', () => {
    const task = buildTask({ display_number: 115, id: 'task-1' });

    expect(taskMatchesBoardSearch(task, 'timeline', 'RD')).toBe(true);
    expect(taskMatchesBoardSearch(task, '115', 'RD')).toBe(true);
    expect(taskMatchesBoardSearch(task, 'rd-115', 'RD')).toBe(true);
  });

  it('matches task metadata and ignores missing display numbers', () => {
    const task = buildTask({
      assignees: [{ display_name: 'Ada Lovelace', id: 'user-1' }],
      display_number: null as unknown as number,
      id: 'task-1',
      labels: [
        {
          color: 'BLUE',
          created_at: '2026-03-07T00:00:00.000Z',
          id: 'label-1',
          name: 'Backend',
        },
      ],
    });

    expect(taskMatchesBoardSearch(task, 'ada', 'RD')).toBe(true);
    expect(taskMatchesBoardSearch(task, 'backend', 'RD')).toBe(true);
    expect(taskMatchesBoardSearch(task, 'rd-null', 'RD')).toBe(false);
  });
});

describe('buildTaskSearchQueryVariants', () => {
  const base: ListWorkspaceTasksOptions = {
    boardId: 'board-1',
    labelIds: ['label-1'],
    limit: 200,
    listStatuses: ['active'],
    q: 'login',
    sortBy: 'name-asc',
  };

  it('skips the identifier leg for plain text queries', () => {
    expect(buildTaskSearchQueryVariants(base)).toEqual({
      identifierQuery: null,
      nameQuery: base,
    });
  });

  it('adds an identifier leg for ticket-like queries and clears q', () => {
    const { identifierQuery, nameQuery } = buildTaskSearchQueryVariants({
      ...base,
      q: '115',
    });

    expect(nameQuery.q).toBe('115');
    expect(identifierQuery?.identifier).toBe('115');
    expect(identifierQuery?.q).toBeUndefined();
  });

  it('leaves every other option untouched on the identifier leg', () => {
    const { identifierQuery } = buildTaskSearchQueryVariants({
      ...base,
      q: 'DEV-115',
    });

    expect(identifierQuery).toEqual({
      ...base,
      identifier: 'DEV-115',
      q: undefined,
    });
  });
});

describe('mergeTasksById', () => {
  const first = buildTask({ id: 'task-ticket' });
  const second = buildTask({ id: 'task-name' });

  it('keeps primary entries first', () => {
    expect(mergeTasksById([first], [second]).map((task) => task.id)).toEqual([
      'task-ticket',
      'task-name',
    ]);
  });

  it('de-duplicates tasks matched by both legs', () => {
    expect(mergeTasksById([first], [first])).toEqual([first]);
  });

  it('handles empty inputs', () => {
    expect(mergeTasksById([], [second])).toEqual([second]);
    expect(mergeTasksById([first], [])).toEqual([first]);
    expect(mergeTasksById([], [])).toEqual([]);
  });
});

describe('mergeListCountsByListId', () => {
  it('unions disjoint lists', () => {
    expect(
      mergeListCountsByListId(
        [{ count: 2, list_id: 'list-1' }],
        [{ count: 1, list_id: 'list-2' }]
      )
    ).toEqual([
      { count: 2, list_id: 'list-1' },
      { count: 1, list_id: 'list-2' },
    ]);
  });

  it('takes the max rather than summing overlapping lists', () => {
    expect(
      mergeListCountsByListId(
        [{ count: 3, list_id: 'list-1' }],
        [{ count: 1, list_id: 'list-1' }]
      )
    ).toEqual([{ count: 3, list_id: 'list-1' }]);
  });

  it('surfaces a list that only the identifier leg matched', () => {
    expect(
      mergeListCountsByListId([], [{ count: 1, list_id: 'list-1' }])
    ).toEqual([{ count: 1, list_id: 'list-1' }]);
  });
});

describe('listBoardTasksForSearch', () => {
  const ticketMatch = buildTask({ display_number: 115, id: 'task-ticket' });
  const nameMatch = buildTask({ id: 'task-name', name: 'Sprint 115 planning' });

  it('uses one request for a plain-text search', async () => {
    listWorkspaceTasksMock.mockResolvedValue({ tasks: [nameMatch] });

    await expect(
      listBoardTasksForSearch('ws-1', { boardId: 'board-1', q: 'launch' })
    ).resolves.toEqual([nameMatch]);
    expect(listWorkspaceTasksMock).toHaveBeenCalledOnce();
  });

  it('merges identifier hits first without duplicates', async () => {
    listWorkspaceTasksMock.mockImplementation(
      async (_workspaceId: string, options: ListWorkspaceTasksOptions) =>
        options.identifier
          ? { tasks: [ticketMatch] }
          : { tasks: [ticketMatch, nameMatch] }
    );

    await expect(
      listBoardTasksForSearch('ws-1', {
        boardId: 'board-1',
        limit: 200,
        q: '115',
      })
    ).resolves.toEqual([ticketMatch, nameMatch]);
    expect(listWorkspaceTasksMock).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({ identifier: '115', limit: 50, q: undefined })
    );
  });
});

describe('listBoardTaskCountsForSearch', () => {
  it('unions list visibility across name and identifier matches', async () => {
    listWorkspaceTasksMock.mockImplementation(
      async (_workspaceId: string, options: ListWorkspaceTasksOptions) => ({
        listCounts: options.identifier
          ? [{ count: 1, list_id: 'list-ticket' }]
          : [{ count: 2, list_id: 'list-name' }],
        tasks: [],
      })
    );

    await expect(
      listBoardTaskCountsForSearch('ws-1', {
        boardId: 'board-1',
        includeListCounts: true,
        q: 'DEV-115',
      })
    ).resolves.toEqual([
      { count: 2, list_id: 'list-name' },
      { count: 1, list_id: 'list-ticket' },
    ]);
  });
});
