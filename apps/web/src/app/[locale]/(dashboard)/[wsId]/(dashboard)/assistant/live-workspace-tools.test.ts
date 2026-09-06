import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  listWorkspaceCalendarEvents: mocks.list,
  createWorkspaceCalendarEvent: mocks.create,
}));

import { executeWorkspaceLiveTool } from './live-workspace-tools';

describe('workspace live tools', () => {
  beforeEach(() => vi.clearAllMocks());
  it('rejects invalid and unbounded date ranges before API access', async () => {
    for (const args of [
      { start_at: 'tomorrow', end_at: 'Friday' },
      { start_at: '2026-01-01T00:00:00Z', end_at: '2026-03-01T00:00:00Z' },
      { start_at: '2026-01-01T00:00:00Z', end_at: '2025-01-01T00:00:00Z' },
    ]) {
      await expect(
        executeWorkspaceLiveTool('get_calendar_events', args, 'workspace-a')
      ).rejects.toThrow();
    }
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it('uses the fixed current workspace and returns bounded calendar context', async () => {
    mocks.list.mockResolvedValue({
      count: 70,
      data: Array.from({ length: 70 }, (_, i) => ({
        id: String(i),
        title: 'Meeting',
        description: 'private long body',
      })),
    });
    const result = await executeWorkspaceLiveTool(
      'get_calendar_events',
      {
        wsId: 'attacker-workspace',
        start_at: '2026-09-06T00:00:00+07:00',
        end_at: '2026-09-07T00:00:00+07:00',
      },
      'workspace-a'
    );
    expect(mocks.list.mock.calls[0]?.[0]).toBe('workspace-a');
    expect(result?.events).toHaveLength(50);
    expect(result?.truncated).toBe(true);
    expect(((result?.events ?? []) as object[])[0]).not.toHaveProperty(
      'description'
    );
  });
  it('creates first-party events without accepting model-controlled provider or workspace', async () => {
    mocks.create.mockResolvedValue({ id: 'event-1' });
    await executeWorkspaceLiveTool(
      'create_calendar_event',
      {
        title: 'Focus',
        start_at: '2026-09-06T10:00:00+07:00',
        end_at: '2026-09-06T11:00:00+07:00',
        source: { provider: 'google' },
        wsId: 'other',
      },
      'workspace-a'
    );
    expect(mocks.create).toHaveBeenCalledWith(
      'workspace-a',
      expect.objectContaining({ source: { provider: 'tuturuuu' } }),
      { signal: undefined }
    );
    expect(mocks.create.mock.calls[0]?.[1]).not.toHaveProperty('wsId');
  });
});
