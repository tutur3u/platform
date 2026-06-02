import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

type QueryResult = {
  data?: unknown;
  error?: { message: string } | null;
};

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  queries: [] as Array<{ calls: [string, unknown[]][]; table: string }>,
  queue: [] as QueryResult[],
  sendTopicAnnouncement: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/app/api/v1/workspaces/[wsId]/topic-announcements/email', () => ({
  sendTopicAnnouncement: mocks.sendTopicAnnouncement,
}));

function queueResult(result: QueryResult) {
  mocks.queue.push(result);
}

function createQuery(table: string, result: QueryResult) {
  const query = {
    calls: [] as [string, unknown[]][],
    eq: vi.fn((...args: unknown[]) => {
      query.calls.push(['eq', args]);
      return query;
    }),
    limit: vi.fn((...args: unknown[]) => {
      query.calls.push(['limit', args]);
      return Promise.resolve(result);
    }),
    lt: vi.fn((...args: unknown[]) => {
      query.calls.push(['lt', args]);
      return Promise.resolve(result);
    }),
    lte: vi.fn((...args: unknown[]) => {
      query.calls.push(['lte', args]);
      return query;
    }),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    not: vi.fn((...args: unknown[]) => {
      query.calls.push(['not', args]);
      return query;
    }),
    order: vi.fn((...args: unknown[]) => {
      query.calls.push(['order', args]);
      return query;
    }),
    select: vi.fn((...args: unknown[]) => {
      query.calls.push(['select', args]);
      return query;
    }),
    update: vi.fn((...args: unknown[]) => {
      query.calls.push(['update', args]);
      return query;
    }),
  };

  Object.defineProperty(query, 'then', {
    value: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  });

  mocks.queries.push({ calls: query.calls, table });
  return query;
}

function createAdminClient() {
  return {
    schema: vi.fn((schemaName: string) => {
      expect(schemaName).toBe('private');
      return {
        from: vi.fn((table: string) =>
          createQuery(table, mocks.queue.shift() ?? { data: [], error: null })
        ),
      };
    }),
  };
}

function cronRequest(headers: Record<string, string> = {}) {
  return new NextRequest(
    'http://localhost/api/cron/process-topic-announcement-queue',
    { headers }
  );
}

describe('process-topic-announcement-queue cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    vi.stubEnv('VERCEL_CRON_SECRET', '');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-02T12:00:00.000Z'));
    mocks.queries.length = 0;
    mocks.queue.length = 0;
    mocks.createAdminClient.mockResolvedValue(createAdminClient());
    mocks.sendTopicAnnouncement.mockResolvedValue({
      auditId: 'audit-1',
      messageId: 'message-1',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('rejects unauthenticated requests before creating an admin client', async () => {
    const { GET } = await import('./route');

    const response = await GET(cronRequest());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: 'Unauthorized',
      ok: false,
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.sendTopicAnnouncement).not.toHaveBeenCalled();
  });

  it('claims a queued announcement before sending it', async () => {
    queueResult({ data: null, error: null });
    queueResult({
      data: [
        {
          created_by: 'creator-user',
          id: 'announcement-1',
          updated_by: 'updater-user',
          ws_id: 'workspace-1',
        },
      ],
      error: null,
    });
    queueResult({
      data: {
        created_by: 'creator-user',
        id: 'announcement-1',
        updated_by: 'updater-user',
        ws_id: 'workspace-1',
      },
      error: null,
    });

    const { GET } = await import('./route');
    const response = await GET(
      cronRequest({ authorization: 'Bearer cron-secret' })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      processed: 1,
      results: [
        {
          announcementId: 'announcement-1',
          success: true,
          wsId: 'workspace-1',
        },
      ],
    });

    const claimQuery = mocks.queries[2];
    expect(claimQuery?.calls).toContainEqual([
      'update',
      [
        {
          last_error: null,
          status: 'processing',
          updated_by: 'updater-user',
        },
      ],
    ]);
    expect(claimQuery?.calls).toContainEqual(['eq', ['status', 'queued']]);
    expect(mocks.sendTopicAnnouncement).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'updater-user',
        announcementId: 'announcement-1',
        normalizedWsId: 'workspace-1',
        resend: false,
      })
    );
  });

  it('does not send a row already claimed by another cron invocation', async () => {
    queueResult({ data: null, error: null });
    queueResult({
      data: [
        {
          created_by: 'creator-user',
          id: 'announcement-1',
          updated_by: 'updater-user',
          ws_id: 'workspace-1',
        },
      ],
      error: null,
    });
    queueResult({ data: null, error: null });

    const { GET } = await import('./route');
    const response = await GET(
      cronRequest({ authorization: 'Bearer cron-secret' })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      processed: 1,
      results: [
        {
          announcementId: 'announcement-1',
          error: 'ALREADY_CLAIMED',
          success: false,
          wsId: 'workspace-1',
        },
      ],
    });
    expect(mocks.sendTopicAnnouncement).not.toHaveBeenCalled();
  });
});
