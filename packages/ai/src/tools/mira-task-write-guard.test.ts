import { expect, it, vi } from 'vitest';
import { createTaskWriteGuard } from './mira-task-write-guard';

it('coalesces parallel duplicate writes and retains the original receipt', async () => {
  const guard = createTaskWriteGuard();
  const execute = vi.fn(async () => ({ created: true, taskId: 'saved' }));
  const results = await Promise.all([
    guard('ws', { name: 'Task', listId: 'list' }, execute),
    guard('ws', { listId: 'list', name: 'Task' }, execute),
  ]);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(results[1]).toMatchObject({ taskId: 'saved', reusedResult: true });
  await guard('other-ws', { name: 'Task', listId: 'list' }, execute);
  expect(execute).toHaveBeenCalledTimes(2);
});
