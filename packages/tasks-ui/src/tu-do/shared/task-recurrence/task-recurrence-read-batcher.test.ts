import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadTaskRecurrenceEntry } from './task-recurrence-read-batcher';

const read = vi.hoisted(() => vi.fn());

vi.mock('@tuturuuu/internal-api/task-recurrence', () => ({
  readWorkspaceTaskRecurrence: read,
  TASK_RECURRENCE_READ_LIMIT: 2,
}));

afterEach(() => read.mockReset());

describe('loadTaskRecurrenceEntry', () => {
  it('coalesces one tick of cards into bounded reads', async () => {
    read.mockImplementation(async (_ws: string, ids: string[]) =>
      ids.filter((id) => id !== 'b').map((id) => ({ task_id: id }))
    );
    const results = await Promise.all(
      ['a', 'b', 'c', 'a'].map((id) => loadTaskRecurrenceEntry('ws-1', id))
    );
    expect(read.mock.calls.map((call) => call[1])).toEqual([['a', 'b'], ['c']]);
    expect(
      results.map((entry: { task_id: string } | null) => entry?.task_id ?? null)
    ).toEqual(['a', null, 'c', 'a']);
  });

  it('resolves no entry when the read fails', async () => {
    read.mockRejectedValue(new Error('offline'));
    await expect(loadTaskRecurrenceEntry('ws-1', 'a')).resolves.toBeNull();
  });
});
