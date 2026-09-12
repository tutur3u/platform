import { expect, it } from 'vitest';
import type { z } from 'zod';
import { taskToolDefinitions } from './tasks';

it('rejects blank searches and conflicting create deadlines', () => {
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
});
