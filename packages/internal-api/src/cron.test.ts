import { describe, expect, it, vi } from 'vitest';
import { listWorkspaceCronJobs } from './cron';

function createJsonResponse(payload: unknown) {
  return {
    json: async () => payload,
    ok: true,
    status: 200,
  };
}

describe('cron internal API helpers', () => {
  const options = (fetchMock: ReturnType<typeof vi.fn>) => ({
    baseUrl: 'https://internal.example.com',
    fetch: fetchMock as unknown as typeof fetch,
  });

  it('lists workspace cron jobs through the centralized workspace API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse([]));

    await listWorkspaceCronJobs('workspace 1', {}, options(fetchMock));

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace%201/cron/jobs',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('sorts, filters, and paginates the legacy cron job array response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse([
        {
          active: true,
          created_at: '2026-06-02T00:00:00.000Z',
          cron_job_id: 2,
          dataset_id: 'dataset-beta',
          id: 'job-2',
          name: 'Beta digest',
          schedule: '0 8 * * *',
          ws_id: 'ws-1',
        },
        {
          active: false,
          created_at: '2026-06-01T00:00:00.000Z',
          cron_job_id: 1,
          dataset_id: 'dataset-alpha',
          id: 'job-1',
          name: 'Alpha sync',
          schedule: '*/15 * * * *',
          ws_id: 'ws-1',
        },
        {
          active: true,
          created_at: '2026-06-03T00:00:00.000Z',
          cron_job_id: 3,
          dataset_id: 'dataset-alpha',
          id: 'job-3',
          name: 'Alpha audit',
          schedule: '0 9 * * 1-5',
          ws_id: 'ws-1',
        },
      ])
    );

    const result = await listWorkspaceCronJobs(
      'ws-1',
      { page: 2, pageSize: 1, q: 'alpha' },
      options(fetchMock)
    );

    expect(result).toEqual({
      count: 2,
      data: [
        {
          active: false,
          created_at: '2026-06-01T00:00:00.000Z',
          cron_job_id: 1,
          dataset_id: 'dataset-alpha',
          id: 'job-1',
          name: 'Alpha sync',
          schedule: '*/15 * * * *',
          ws_id: 'ws-1',
        },
      ],
      page: 2,
      pageSize: 1,
    });
  });

  it('falls back to bounded pagination defaults for invalid params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse([
        {
          active: true,
          created_at: '2026-06-01T00:00:00.000Z',
          cron_job_id: null,
          dataset_id: 'dataset-1',
          id: 'job-1',
          name: 'Daily sync',
          schedule: '0 0 * * *',
          ws_id: 'ws-1',
        },
      ])
    );

    const result = await listWorkspaceCronJobs(
      'ws-1',
      { page: 0, pageSize: 250 },
      options(fetchMock)
    );

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(100);
    expect(result.data).toHaveLength(1);
  });
});
