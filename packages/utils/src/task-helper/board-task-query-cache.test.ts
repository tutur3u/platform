import { type InfiniteData, QueryClient } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { expect, it } from 'vitest';
import {
  type BoardTaskPage,
  getBoardTaskQueries,
  setBoardTaskQueries,
  setBoardTaskQuery,
} from './board-task-query-cache';

it('patches and restores flat and paged board caches without replacing the cursors', () => {
  const client = new QueryClient();
  const prefix = ['tasks-full', 'board-1'];
  const flatKey = [...prefix, 'sprints'];
  const pagedKey = [...prefix, 'pages'];
  const a = { id: 'a', name: 'First' } as Task;
  const b = { id: 'b', name: 'Second' } as Task;
  client.setQueryData(flatKey, [a, b]);
  client.setQueryData(pagedKey, {
    pageParams: ['start', 'board.a'],
    pages: [
      { tasks: [a], nextCursor: 'board.a' },
      { tasks: [b], nextCursor: 'board.b' },
    ],
  });

  const snapshot = getBoardTaskQueries(client, { queryKey: prefix });
  setBoardTaskQueries(client, { queryKey: prefix }, (tasks) =>
    tasks?.flatMap((task) =>
      task.id === 'a' ? [] : [{ ...task, name: 'Edited' }]
    )
  );
  expect(client.getQueryData(flatKey)).toEqual([{ ...b, name: 'Edited' }]);
  expect(client.getQueryData(pagedKey)).toEqual({
    pageParams: ['start', 'board.a'],
    pages: [
      { tasks: [{ ...b, name: 'Edited' }], nextCursor: 'board.a' },
      { tasks: [], nextCursor: 'board.b' },
    ],
  });
  for (const [key, tasks] of snapshot) setBoardTaskQuery(client, key, tasks);
  expect(getBoardTaskQueries(client, { queryKey: prefix })).toEqual(snapshot);
  expect(client.getQueryData(pagedKey)).toMatchObject({
    pageParams: ['start', 'board.a'],
    pages: [{ nextCursor: 'board.a' }, { nextCursor: 'board.b' }],
  });
});

it('leaves a paged board query without its first page for the server', () => {
  const client = new QueryClient();
  const pagedKey = ['tasks-full', 'board-1', 'pages', 'ws-1'];
  const created = { id: 'created', name: 'Created' } as Task;
  client.getQueryCache().build(client, { queryKey: pagedKey });

  setBoardTaskQueries(
    client,
    { queryKey: ['tasks-full', 'board-1'] },
    (tasks) => [...(tasks ?? []), created]
  );
  setBoardTaskQuery(client, pagedKey, [created]);

  expect(client.getQueryData(pagedKey)).toBeUndefined();
});

it('keeps pages loaded after a snapshot when that snapshot is restored', () => {
  const client = new QueryClient();
  const pagedKey = ['tasks-full', 'board-1', 'pages'];
  const a = { id: 'a', name: 'First' } as Task;
  const b = { id: 'b', name: 'Second' } as Task;
  client.setQueryData(pagedKey, {
    pageParams: ['start'],
    pages: [{ tasks: [a], nextCursor: 'board~a' }],
  });
  const snapshot = getBoardTaskQueries(client, { queryKey: pagedKey })[0]?.[1];

  setBoardTaskQuery(client, pagedKey, (tasks) =>
    tasks?.map((task) => ({ ...task, name: 'Optimistic' }))
  );
  client.setQueryData<InfiniteData<BoardTaskPage>>(pagedKey, (data) => ({
    pageParams: [...(data?.pageParams ?? []), 'board~a'],
    pages: [...(data?.pages ?? []), { tasks: [b], nextCursor: null }],
  }));
  setBoardTaskQuery(client, pagedKey, snapshot);

  expect(client.getQueryData(pagedKey)).toEqual({
    pageParams: ['start', 'board~a'],
    pages: [
      { tasks: [a], nextCursor: 'board~a' },
      { tasks: [b], nextCursor: null },
    ],
  });
});
