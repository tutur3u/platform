import { QueryClient } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { expect, it } from 'vitest';
import { reinsertSnapshotTasks } from '../bulk-delete-cache';
import { snapshotBoardTaskCaches } from '../bulk-operation-utils';

it('reinserts a deleted task into a paged board cache without losing its cursor', () => {
  const client = new QueryClient();
  const pagedKey = ['tasks-full', 'board-1', 'pages'];
  const a = { id: 'a', name: 'First' } as Task;
  const b = { id: 'b', name: 'Second' } as Task;
  client.setQueryData(pagedKey, {
    pageParams: ['start'],
    pages: [{ tasks: [a, b], nextCursor: 'board~b' }],
  });
  const snapshot = snapshotBoardTaskCaches(client, 'board-1');
  client.setQueryData(pagedKey, {
    pageParams: ['start'],
    pages: [{ tasks: [b], nextCursor: 'board~b' }],
  });

  reinsertSnapshotTasks(client, 'board-1', snapshot, ['a']);

  expect(client.getQueryData(pagedKey)).toEqual({
    pageParams: ['start'],
    pages: [{ tasks: [a, b], nextCursor: 'board~b' }],
  });
});
