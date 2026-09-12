import { expect, it, vi } from 'vitest';
import { listWorkspaceTasks } from './tasks';

it.each(['first', 'last'] as const)(
  'sends priority placement %s with each task page',
  async (unprioritizedPosition) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ tasks: [] }),
    });
    await listWorkspaceTasks(
      'workspace',
      { sortBy: 'priority-high', unprioritizedPosition, limit: 50, offset: 50 },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as typeof fetch,
      }
    );
    const url = new URL(fetchMock.mock.calls[0]![0]);
    expect(url.searchParams.get('unprioritizedPosition')).toBe(
      unprioritizedPosition
    );
    expect(url.searchParams.get('offset')).toBe('50');
    expect(url.searchParams.get('sortBy')).toBe('priority-high');
  }
);
