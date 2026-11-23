import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => {
  class InternalApiError extends Error {
    constructor(
      message: string,
      public code?: string
    ) {
      super(message);
    }
  }
  return { createMeetFollowup: mocks.create, InternalApiError };
});

import { InternalApiError } from '@tuturuuu/internal-api';
import { manualDraft } from './action-items';
import { saveActionItem } from './save-action-item';

function memoryStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  } as unknown as Storage & { data: Map<string, string> };
}

const draft = {
  ...manualDraft('meeting', 'Book the room', 'board'),
  dueDate: '2026-12-05',
};
const target = (storage: Storage) => ({
  wsId: 'ws',
  meetingId: 'meeting',
  userId: 'host',
  timezone: 'Asia/Ho_Chi_Minh',
  sourceUrl: 'https://tuturuuu.com/meet/ws/meetings/meeting',
  storage,
  readLists: async () => [
    { id: 'done', name: 'Done', status: 'done' },
    { id: 'todo', name: 'To do', status: 'active' },
  ],
});

describe('saveActionItem', () => {
  beforeEach(() => mocks.create.mockReset());

  it('saves into the meeting workspace on the first open list and keeps a receipt', async () => {
    mocks.create.mockResolvedValue({
      url: 'https://tasks.tuturuuu.com/ws/tasks/t1',
    });
    const storage = memoryStorage();
    await expect(saveActionItem(draft, target(storage))).resolves.toMatchObject(
      {
        status: 'saved',
        url: 'https://tasks.tuturuuu.com/ws/tasks/t1',
      }
    );
    expect(mocks.create).toHaveBeenCalledWith(
      'ws',
      'meeting',
      expect.objectContaining({
        requestId: draft.requestId,
        source: 'manual',
        workspaceId: 'ws',
        boardId: 'board',
        listId: 'todo',
        due: '2026-12-05T23:59',
        assigneeIds: [],
        description: 'https://tuturuuu.com/meet/ws/meetings/meeting',
      })
    );
    expect(storage.data.get(`meet-followup:host:${draft.key}`)).toContain(
      'saved'
    );
  });

  it('never resends an item with a pending receipt', async () => {
    const storage = memoryStorage({
      [`meet-followup:host:${draft.key}`]: 'pending',
    });
    await expect(saveActionItem(draft, target(storage))).resolves.toMatchObject(
      {
        status: 'uncertain',
      }
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('allows a retry with a new request id only after a confirmed rejection', async () => {
    mocks.create.mockRejectedValue(
      new (InternalApiError as unknown as new (m: string, c: string) => Error)(
        'not saved',
        'FOLLOWUP_NOT_SAVED'
      )
    );
    const storage = memoryStorage();
    const outcome = await saveActionItem(draft, target(storage));
    expect(outcome.status).toBe('rejected');
    expect(outcome.requestId).not.toBe(draft.requestId);
    expect(storage.data.size).toBe(0);
  });

  it('treats an unconfirmed failure as possibly saved', async () => {
    mocks.create.mockRejectedValue(new Error('network'));
    const storage = memoryStorage();
    await expect(saveActionItem(draft, target(storage))).resolves.toMatchObject(
      {
        status: 'uncertain',
      }
    );
    expect(storage.data.get(`meet-followup:host:${draft.key}`)).toBe('pending');
  });

  it('asks for another board when no list is open', async () => {
    const storage = memoryStorage();
    await expect(
      saveActionItem(draft, {
        ...target(storage),
        readLists: async () => [{ id: 'done', name: 'Done', status: 'done' }],
      })
    ).resolves.toMatchObject({ status: 'no_list' });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
