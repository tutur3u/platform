import { describe, expect, it, vi } from 'vitest';
import type { TuturuuuUserClient } from '../platform';
import type { CliConfig } from './config';
import { selectTaskId } from './selection';

function createClient(tasks: Array<{ id: string }>) {
  return {
    tasks: {
      list: vi.fn().mockResolvedValue({ tasks }),
    },
  } as unknown as TuturuuuUserClient & {
    tasks: {
      list: ReturnType<typeof vi.fn>;
    };
  };
}

describe('CLI selection', () => {
  const config = {
    baseUrl: 'https://tuturuuu.com',
    currentBoardId: 'board-1',
    currentListId: 'list-1',
  } satisfies CliConfig;

  it('uses explicit task UUIDs without an identifier lookup', async () => {
    const client = createClient([]);
    const taskId = '11111111-1111-4111-8111-111111111111';

    await expect(
      selectTaskId(client, config, 'personal', {}, true, taskId)
    ).resolves.toEqual({ config, taskId });
    expect(client.tasks.list).not.toHaveBeenCalled();
  });

  it.each(['F-12', 'VHP-12'])(
    'resolves %s without the saved board or list scope',
    async (identifier) => {
      const client = createClient([{ id: 'task-1' }]);

      await expect(
        selectTaskId(client, config, 'personal', {}, true, identifier)
      ).resolves.toEqual({ config, taskId: 'task-1' });
      expect(client.tasks.list).toHaveBeenCalledWith('personal', {
        boardId: undefined,
        completed: undefined,
        closed: undefined,
        identifier,
        includeDeleted: false,
        limit: 2,
        listId: undefined,
      });
    }
  );

  it('keeps explicit list scope when resolving a task identifier', async () => {
    const client = createClient([{ id: 'task-1' }]);

    await selectTaskId(
      client,
      config,
      'personal',
      { list: 'target-list' },
      true,
      'VHP-12'
    );

    expect(client.tasks.list).toHaveBeenCalledWith(
      'personal',
      expect.objectContaining({
        listId: 'target-list',
      })
    );
  });

  it('reports missing task identifiers clearly', async () => {
    const client = createClient([]);

    await expect(
      selectTaskId(client, config, 'personal', {}, true, 'VHP-404')
    ).rejects.toThrow('Task identifier VHP-404 was not found.');
  });
});
