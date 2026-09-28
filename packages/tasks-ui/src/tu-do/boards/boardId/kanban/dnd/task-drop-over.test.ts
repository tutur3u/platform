import type { DragEndEvent } from '@dnd-kit/core';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { expect, it } from 'vitest';
import { getTaskDropOver } from './task-drop-over';

it('keeps a valid cross-column target when collision is lost at release', () => {
  const event = {
    active: { id: 'task', data: { current: { type: 'Task' } } },
    over: null,
  } as unknown as DragEndEvent;
  const columns = [{ id: 'source' }, { id: 'target' }] as TaskList[];
  const preview = {
    task: { id: 'task' },
    listId: 'target',
  } as Parameters<typeof getTaskDropOver>[0]['preview'];

  expect(
    getTaskDropOver({ event, originalListId: 'source', preview, columns })?.id
  ).toBe('target');
  expect(
    getTaskDropOver({ event, originalListId: 'target', preview, columns })
  ).toBeNull();
});
