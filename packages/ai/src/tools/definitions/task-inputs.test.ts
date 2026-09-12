import { expect, it } from 'vitest';
import type { z } from 'zod';
import { taskToolDefinitions } from './tasks';

it('validates search queries and create deadline aliases', () => {
  const search = taskToolDefinitions.search_tasks.inputSchema as z.ZodType;
  const create = taskToolDefinitions.create_task.inputSchema as z.ZodType;
  expect(search.safeParse({ query: '  ' }).success).toBe(false);
  expect(
    create.safeParse({
      name: 'Task',
      endDate: '2026-09-14T00:00:00Z',
      dueDate: '2026-09-15T00:00:00Z',
    }).success
  ).toBe(false);
  expect(
    create.safeParse({ name: 'Task', dueDate: '2026-09-14T00:00:00Z' }).success
  ).toBe(true);
  for (const aliases of [
    { endDate: '2026-09-14T00:00:00Z', dueDate: null },
    { endDate: null, dueDate: '2026-09-14T00:00:00Z' },
  ])
    expect(create.safeParse({ name: 'Task', ...aliases }).success).toBe(true);
});

it('keeps update nulls as explicit clears and rejects contradictory aliases', () => {
  const update = taskToolDefinitions.update_task.inputSchema as z.ZodType;
  const taskId = '2ced201e-94ad-4455-b93d-fa64c8463a35';
  expect(update.safeParse({ taskId, endDate: null }).success).toBe(true);
  expect(update.safeParse({ taskId, dueDate: null }).success).toBe(true);
  for (const aliases of [
    { endDate: '2026-09-14T00:00:00Z', dueDate: null },
    { endDate: null, dueDate: '2026-09-14T00:00:00Z' },
  ])
    expect(update.safeParse({ taskId, ...aliases }).success).toBe(false);
});
