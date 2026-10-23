import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

import { DEVBOX_RUN_LOG_PAGE_SIZE, listDevboxRunLogs } from './store';
import { DevboxStoreError } from './store-utils';

describe('devbox run log paging', () => {
  const rangeMock = vi.fn();
  const orderMock = vi.fn();
  const eqMock = vi.fn();
  const fromMock = vi.fn();
  const ownedRunLimitMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    const eventsQuery = { order: orderMock, range: rangeMock };
    orderMock.mockReturnValue(eventsQuery);
    eqMock.mockReturnValue(eventsQuery);
    const ownedRunQuery = {
      eq: vi.fn(() => ownedRunQuery),
      limit: ownedRunLimitMock,
    };
    ownedRunLimitMock.mockResolvedValue({
      data: [{ id: 'run-1' }],
      error: null,
    });
    fromMock.mockImplementation((table: string) =>
      table === 'devbox_runs'
        ? { select: vi.fn(() => ownedRunQuery) }
        : { select: vi.fn(() => ({ eq: eqMock })) }
    );
    createAdminClientMock.mockResolvedValue({
      schema: vi.fn().mockReturnValue({ from: fromMock }),
    });
  });

  it('reads a stable page from the offset and returns the next raw offset', async () => {
    rangeMock.mockResolvedValue({
      data: [{ message: 'one' }, { message: '' }, { message: 'two' }],
      error: null,
    });

    await expect(
      listDevboxRunLogs({ actorId: 'owner', offset: 2000, runId: 'run-1' })
    ).resolves.toEqual({ logs: ['one', 'two'], next: 2003 });

    expect(fromMock).toHaveBeenCalledWith('devbox_run_events');
    expect(eqMock).toHaveBeenCalledWith('run_id', 'run-1');
    expect(orderMock).toHaveBeenNthCalledWith(1, 'created_at', {
      ascending: true,
    });
    expect(orderMock).toHaveBeenNthCalledWith(2, 'id', { ascending: true });
    expect(rangeMock).toHaveBeenCalledWith(
      2000,
      2000 + DEVBOX_RUN_LOG_PAGE_SIZE - 1
    );
  });

  it('defaults to the first page', async () => {
    rangeMock.mockResolvedValue({ data: [], error: null });
    await expect(
      listDevboxRunLogs({ actorId: 'owner', runId: 'run-1' })
    ).resolves.toEqual({
      logs: [],
      next: 0,
    });
    expect(rangeMock).toHaveBeenCalledWith(0, DEVBOX_RUN_LOG_PAGE_SIZE - 1);
  });

  it('does not page events for a run the actor does not own', async () => {
    ownedRunLimitMock.mockResolvedValue({ data: [], error: null });

    await expect(
      listDevboxRunLogs({ actorId: 'other', offset: 0, runId: 'run-1' })
    ).rejects.toBeInstanceOf(DevboxStoreError);
    expect(rangeMock).not.toHaveBeenCalled();
  });
});
