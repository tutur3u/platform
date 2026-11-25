import { QueryClient } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type BoardTaskApi,
  createBoardTaskActions,
} from '../board-task-actions';
import {
  boardTasksQueryKey,
  createBoardTaskCollection,
  diffBoardTasks,
} from '../board-task-collection';

const BOARD = 'board-1';

function task(id: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    name: `Task ${id}`,
    list_id: 'todo',
    sort_key: 100,
    priority: null,
    ...patch,
  } as Task;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const clients: QueryClient[] = [];

function setup(initial: Task[], api: Partial<BoardTaskApi> = {}) {
  const queryClient = new QueryClient();
  clients.push(queryClient);
  queryClient.setQueryData(boardTasksQueryKey(BOARD), initial);
  const collection = createBoardTaskCollection({
    boardId: BOARD,
    queryClient,
  });
  let counter = 0;
  const actions = createBoardTaskActions({
    api: {
      createTask: api.createTask ?? (async () => task('server')),
      updateTask: api.updateTask ?? (async (id) => task(id)),
      reorderTask: api.reorderTask ?? (async (id) => task(id)),
    },
    boardId: BOARD,
    collection,
    createTempId: () => `temp-${++counter}`,
    queryClient,
  });
  const cacheRow = (id: string) =>
    queryClient
      .getQueryData<Task[]>(boardTasksQueryKey(BOARD))
      ?.find((row) => row.id === id);
  const remoteUpsert = (row: Task) =>
    queryClient.setQueryData<Task[]>(boardTasksQueryKey(BOARD), (rows = []) =>
      rows.some((r) => r.id === row.id)
        ? rows.map((r) => (r.id === row.id ? row : r))
        : [...rows, row]
    );
  return { actions, cacheRow, collection, queryClient, remoteUpsert };
}

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

describe('diffBoardTasks', () => {
  it('emits inserts, reference-changed updates and deletes', () => {
    const a = task('a');
    const b = task('b');
    const previous = new Map([
      ['a', a],
      ['b', b],
    ]);
    const nextA = { ...a, name: 'renamed' };
    const { changes } = diffBoardTasks(previous, [nextA, task('c')]);
    expect(changes).toEqual([
      { type: 'update', value: nextA },
      { type: 'insert', value: task('c') },
      { type: 'delete', key: 'b' },
    ]);
  });
});

describe('board task collection mirror', () => {
  it('follows realtime writes to the query cache', () => {
    const { collection, queryClient, remoteUpsert } = setup([task('a')]);
    expect(collection.get('a')?.name).toBe('Task a');

    remoteUpsert(task('a', { name: 'From another user' }));
    remoteUpsert(task('b'));
    expect(collection.get('a')?.name).toBe('From another user');
    expect(collection.has('b')).toBe(true);

    queryClient.setQueryData<Task[]>(boardTasksQueryKey(BOARD), [task('b')]);
    expect(collection.has('a')).toBe(false);
  });
});

describe('instant create', () => {
  it('shows the row instantly and swaps it for the server row', async () => {
    const server = deferred<Task>();
    const { actions, collection } = setup([task('a', { sort_key: 50 })], {
      createTask: () => server.promise,
    });

    const pending = actions.createTask('todo', { name: '  New  ' });
    const optimistic = collection.get('temp-1');
    expect(optimistic?.name).toBe('New');
    expect(optimistic?.sort_key).toBe(49);
    expect(optimistic?.$hasPendingWrites).toBe(true);

    server.resolve(task('real-1', { name: 'New', sort_key: 49 }));
    await expect(pending).resolves.toMatchObject({ id: 'real-1' });
    expect(collection.has('temp-1')).toBe(false);
    expect(collection.get('real-1')?.$hasPendingWrites).toBe(false);
    expect(collection.size).toBe(2);
  });

  it('removes the optimistic row when the server rejects', async () => {
    const { actions, collection, cacheRow } = setup([task('a')], {
      createTask: async () => {
        throw new Error('quota exceeded');
      },
    });
    await expect(actions.createTask('todo', { name: 'x' })).rejects.toThrow(
      'quota exceeded'
    );
    expect(collection.has('temp-1')).toBe(false);
    expect(cacheRow('temp-1')).toBeUndefined();
    expect(collection.size).toBe(1);
  });
});

describe('instant update rollback and conflicts', () => {
  it('rolls back only the failed write and keeps concurrent remote rows', async () => {
    const server = deferred<Task>();
    const { actions, collection, remoteUpsert } = setup(
      [task('a'), task('b')],
      { updateTask: () => server.promise }
    );

    const pending = actions.updateTask('a', { priority: 'critical' });
    expect(collection.get('a')?.priority).toBe('critical');

    // Another user renames task b while our write is in flight.
    remoteUpsert(task('b', { name: 'Renamed remotely' }));

    server.reject(new Error('forbidden'));
    await expect(pending).rejects.toThrow('forbidden');

    expect(collection.get('a')?.priority).toBeNull();
    // A snapshot rollback would have restored "Task b" here.
    expect(collection.get('b')?.name).toBe('Renamed remotely');
  });

  it('ignores undefined fields like the server does', async () => {
    const seen: Partial<Task>[] = [];
    const { actions, collection } = setup(
      [task('a', { description: 'keep me' })],
      {
        updateTask: async (id, updates) => {
          seen.push(updates);
          return task(id, { description: 'keep me', name: 'New' });
        },
      }
    );
    const pending = actions.updateTask('a', {
      name: 'New',
      description: undefined,
    });
    expect(collection.get('a')?.description).toBe('keep me');
    await pending;
    expect(seen).toEqual([{ name: 'New' }]);
  });

  it('surfaces the newer remote value of the same task after a failed write', async () => {
    const server = deferred<Task>();
    const { actions, collection, remoteUpsert } = setup([task('a')], {
      updateTask: () => server.promise,
    });

    const pending = actions.updateTask('a', { name: 'Mine' });
    remoteUpsert(task('a', { name: 'Theirs' }));
    // The remote write is held while ours persists, so ours stays visible.
    expect(collection.get('a')?.name).toBe('Mine');

    server.reject(new Error('conflict'));
    await expect(pending).rejects.toThrow('conflict');
    expect(collection.get('a')?.name).toBe('Theirs');
  });

  it('settles a later in-flight write on the same task to server truth', async () => {
    const first = deferred<Task>();
    const second = deferred<Task>();
    const calls = [first, second];
    const { actions, collection } = setup([task('a')], {
      updateTask: () => (calls.shift() as typeof first).promise,
    });

    const p1 = actions.updateTask('a', { priority: 'high' });
    const p2 = actions.updateTask('a', { name: 'Edited' });
    expect(collection.get('a')).toMatchObject({
      priority: 'high',
      name: 'Edited',
    });

    first.reject(new Error('offline'));
    await expect(p1).rejects.toThrow('offline');

    // The second write is already persisting, so it is not rolled back with
    // the first. Its overlay captured the whole row, including the failed
    // priority, until it settles; then the confirmed server row wins.
    expect(collection.get('a')?.$hasPendingWrites).toBe(true);
    second.resolve(task('a', { name: 'Edited', priority: null }));
    await expect(p2).resolves.toMatchObject({ name: 'Edited' });
    expect(collection.get('a')).toMatchObject({
      priority: null,
      name: 'Edited',
      $hasPendingWrites: false,
    });
  });
});

describe('instant reorder', () => {
  it('moves instantly and reverts the drag preview row on failure', async () => {
    const original = task('a', { list_id: 'todo', sort_key: 100 });
    const { actions, cacheRow, collection, queryClient } = setup([original], {
      reorderTask: async () => {
        throw new Error('network');
      },
    });
    // Drag preview writes speculative state into the synced cache first.
    const preview = { ...original, list_id: 'done', sort_key: 5 };
    queryClient.setQueryData(boardTasksQueryKey(BOARD), [preview]);

    await expect(
      actions.reorderTask({
        taskId: 'a',
        newListId: 'done',
        newSortKey: 5,
        targetListStatus: 'done',
        optimisticPreviousTasks: [original],
      })
    ).rejects.toThrow('network');

    expect(cacheRow('a')).toEqual(original);
    expect(collection.get('a')?.list_id).toBe('todo');
  });

  it('still persists when the drop preview already shows the target state', async () => {
    const original = task('a', {
      list_id: 'todo',
      sort_key: 100,
      completed: false,
      completed_at: null,
      closed_at: null,
    } as unknown as Partial<Task>);
    const calls: string[] = [];
    const { actions, cacheRow, queryClient } = setup([original], {
      reorderTask: async (id, listId, sortKey) => {
        calls.push(`${id}:${listId}:${sortKey}`);
        return task(id, { list_id: listId, sort_key: sortKey });
      },
    });
    // Same values the instant overlay would compute: the overlay has no diff.
    const preview = {
      ...original,
      list_id: 'review',
      sort_key: 5,
      completed: false,
      completed_at: null,
      closed_at: null,
      _localMutationAt: 1,
    } as unknown as Task;
    queryClient.setQueryData(boardTasksQueryKey(BOARD), [preview]);

    await expect(
      actions.reorderTask({
        taskId: 'a',
        newListId: 'review',
        newSortKey: 5,
        targetListStatus: 'review',
        optimisticPreviousTasks: [original],
      })
    ).resolves.toMatchObject({ list_id: 'review' });
    expect(calls).toEqual(['a:review:5']);
    expect(cacheRow('a')?.list_id).toBe('review');
  });

  it('persists writes for tasks that are not loaded in the collection', async () => {
    const calls: string[] = [];
    const { actions } = setup([task('a')], {
      updateTask: async (id) => {
        calls.push(id);
        return task(id);
      },
    });
    await expect(
      actions.updateTask('elsewhere', { name: 'x' })
    ).resolves.toMatchObject({ id: 'elsewhere' });
    expect(calls).toEqual(['elsewhere']);
  });

  it('keeps a newer remote move instead of reverting to the stale snapshot', async () => {
    const original = task('a', { list_id: 'todo' });
    const server = deferred<Task>();
    const { actions, collection, queryClient, remoteUpsert } = setup(
      [original],
      { reorderTask: () => server.promise }
    );
    const preview = { ...original, list_id: 'done', sort_key: 5 };
    queryClient.setQueryData(boardTasksQueryKey(BOARD), [preview]);

    const pending = actions.reorderTask({
      taskId: 'a',
      newListId: 'done',
      newSortKey: 5,
      targetListStatus: 'done',
      optimisticPreviousTasks: [original],
    });
    expect(
      (collection.get('a') as { completed?: boolean } | undefined)?.completed
    ).toBe(true);

    remoteUpsert(task('a', { list_id: 'review' }));
    server.reject(new Error('network'));
    await expect(pending).rejects.toThrow('network');

    expect(collection.get('a')?.list_id).toBe('review');
  });
});
