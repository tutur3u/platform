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
  expect(results[0]).toEqual({ created: true, taskId: 'saved' });
  expect(results[1]).toMatchObject({
    taskId: 'saved',
    reusedResult: true,
    instruction: expect.stringContaining('stop retrying'),
  });
  await guard('other-ws', { name: 'Task', listId: 'list' }, execute);
  expect(execute).toHaveBeenCalledTimes(2);
});

it('coalesces equivalent deadline aliases, offsets and omitted defaults', async () => {
  const guard = createTaskWriteGuard();
  const execute = vi.fn(async () => ({ success: true, taskId: 'saved' }));
  await guard(
    'ws',
    { name: 'Task', dueDate: '2026-09-14T09:00:00+07:00' },
    execute
  );
  expect(
    await guard(
      'ws',
      {
        name: 'Task',
        endDate: '2026-09-14T02:00:00Z',
        assignToSelf: true,
        priority: null,
      },
      execute
    )
  ).toHaveProperty('reusedResult', true);
  expect(execute).toHaveBeenCalledOnce();
});
it('allows a known pre-write failure to retry', async () => {
  const guard = createTaskWriteGuard();
  const execute = vi
    .fn()
    .mockResolvedValueOnce({ created: false, error: 'Lookup unavailable' })
    .mockResolvedValue({ success: true, taskId: 'saved' });
  await guard('ws', { name: 'Task' }, execute);
  expect(await guard('ws', { name: 'Task' }, execute)).toHaveProperty(
    'taskId',
    'saved'
  );
  expect(execute).toHaveBeenCalledTimes(2);
});
it('retains a usable uncertain-write receipt after an interrupted execution', async () => {
  const guard = createTaskWriteGuard();
  const execute = vi.fn().mockRejectedValue(new Error('Disconnected'));
  const [first, duplicate] = await Promise.all([
    guard('ws', { name: 'Task' }, execute),
    guard('ws', { name: 'Task' }, execute),
  ]);
  expect(first).toMatchObject({ success: false, writeUncertain: true });
  expect(first).not.toHaveProperty('reusedResult');
  expect(duplicate).toMatchObject({
    reusedResult: true,
    instruction: expect.stringContaining('stop retrying'),
  });
  expect(execute).toHaveBeenCalledOnce();
});
