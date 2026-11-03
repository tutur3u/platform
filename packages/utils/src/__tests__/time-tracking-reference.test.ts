import { describe, expect, it, vi } from 'vitest';
import {
  validateRequestCategory,
  validateRequestReferences,
  validateRequestTask,
} from '../time-tracking-reference';

const TASK = '22222222-2222-4222-8222-222222222222';
const CATEGORY = '33333333-3333-4333-8333-333333333333';

function clientReturning(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  return { client: { from: vi.fn(() => query) }, query };
}

describe('time tracking request references', () => {
  it('skips the lookup when no reference is given', async () => {
    const { client } = clientReturning({ data: null, error: null });
    expect(
      await validateRequestReferences({
        client: client as never,
        taskId: '',
        categoryId: null,
        wsId: 'workspace',
      })
    ).toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });

  it('resolves a task through its board workspace', async () => {
    const task = (wsId: string) => ({
      data: { id: TASK, task_lists: { workspace_boards: { ws_id: wsId } } },
      error: null,
    });
    const run = (result: { data: unknown; error: unknown }) =>
      validateRequestTask({
        client: clientReturning(result).client as never,
        taskId: TASK,
        wsId: 'workspace',
      });

    expect(await run(task('workspace'))).toBeNull();
    expect(await run(task('other'))).toMatchObject({ status: 400 });
    expect(await run({ data: null, error: null })).toMatchObject({
      status: 400,
    });
    expect(await run({ data: null, error: { message: 'x' } })).toMatchObject({
      status: 500,
    });
  });

  it('scopes a category lookup to the workspace', async () => {
    const { client, query } = clientReturning({ data: null, error: null });
    const input = {
      client: client as never,
      categoryId: CATEGORY,
      wsId: 'workspace',
    };

    expect(await validateRequestCategory(input)).toMatchObject({ status: 400 });
    expect(client.from).toHaveBeenCalledWith('time_tracking_categories');
    expect(query.eq).toHaveBeenCalledWith('id', CATEGORY);
    expect(query.eq).toHaveBeenCalledWith('ws_id', 'workspace');

    query.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'x' },
    });
    expect(await validateRequestCategory(input)).toMatchObject({ status: 500 });

    query.maybeSingle.mockResolvedValue({
      data: { id: CATEGORY },
      error: null,
    });
    expect(await validateRequestCategory(input)).toBeNull();
    expect(
      await validateRequestCategory({ ...input, categoryId: 'nope' })
    ).toMatchObject({ status: 400 });
  });
});
