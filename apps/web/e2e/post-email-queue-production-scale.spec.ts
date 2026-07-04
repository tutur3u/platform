import { type APIResponse, expect, test } from '@playwright/test';
import {
  assertSafeE2EEnvironment,
  LOCAL_E2E_CRON_SECRET,
} from './helpers/environment';
import {
  cleanupPostEmailQueueScaleFixture,
  type PostEmailQueueScaleFixture,
  seedPostEmailQueueScaleFixture,
} from './helpers/post-email-queue-fixtures';

const CRON_SECRET =
  process.env.CRON_SECRET ??
  process.env.VERCEL_CRON_SECRET ??
  LOCAL_E2E_CRON_SECRET;

type CountSummary = Record<string, number>;

type PostsApiResponse = {
  count: number;
  data: Array<{
    approval_approved_at?: string | null;
    approval_status?: string | null;
    queue_attempt_count?: number;
    queue_created_at?: string | null;
    queue_last_attempt_at?: string | null;
    queue_last_error?: string | null;
    queue_status?: string | null;
    stage?: string | null;
  }>;
  summary: {
    approvals: CountSummary;
    queue: CountSummary;
    stages: CountSummary;
    total?: number;
  };
};

type CronResponse = {
  claimed?: number;
  diagnostics: {
    queueAfter: CountSummary;
    queueBefore: CountSummary;
  };
  failed?: number;
  ok: boolean;
  processed?: number;
};

function postsQuery(params: Record<string, string>) {
  return new URLSearchParams({
    pageSize: '10',
    showAll: 'true',
    ...params,
  }).toString();
}

async function expectJsonResponse<T>(
  response: APIResponse,
  expectedStatus = 200
): Promise<T> {
  if (response.status() !== expectedStatus) {
    expect(response.status(), await response.text()).toBe(expectedStatus);
  }
  return response.json();
}

test.describe('Post email queue production scale', () => {
  test.beforeAll(() => {
    assertSafeE2EEnvironment();
  });

  test('keeps approved queued posts observable without treating them as pending approval', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);

    let fixture: PostEmailQueueScaleFixture | null = null;

    try {
      fixture = await seedPostEmailQueueScaleFixture({ request });

      const allPostsResponse = await request.get(
        `/api/v1/workspaces/${fixture.workspaceId}/posts?${postsQuery({})}`,
        { failOnStatusCode: false }
      );
      const allPosts =
        await expectJsonResponse<PostsApiResponse>(allPostsResponse);

      expect(allPosts.count).toBe(fixture.totalPostRows);
      expect(allPosts.summary.approvals.approved).toBeGreaterThanOrEqual(
        fixture.approvedQueuedRows
      );
      expect(allPosts.summary.queue.queued).toBe(fixture.approvedQueuedRows);
      expect(allPosts.summary.stages.pending_approval).toBe(200);

      const queuedPostsResponse = await request.get(
        `/api/v1/workspaces/${fixture.workspaceId}/posts?${postsQuery({
          approvalStatus: 'APPROVED',
          queueStatus: 'queued',
        })}`,
        { failOnStatusCode: false }
      );
      const queuedPosts =
        await expectJsonResponse<PostsApiResponse>(queuedPostsResponse);

      expect(queuedPosts.count).toBe(fixture.approvedQueuedRows);
      expect(queuedPosts.summary.stages.pending_approval).toBe(0);
      expect(queuedPosts.summary.stages.queued).toBe(
        fixture.approvedQueuedRows
      );
      expect(queuedPosts.data).toHaveLength(10);

      for (const row of queuedPosts.data) {
        expect(row.approval_status).toBe('APPROVED');
        expect(row.queue_status).toBe('queued');
        expect(row.stage).toBe('queued');
      }

      expect(queuedPosts.data[0]).toEqual(
        expect.objectContaining({
          approval_approved_at: expect.any(String),
          queue_attempt_count: expect.any(Number),
          queue_created_at: expect.any(String),
        })
      );

      const pendingPostsResponse = await request.get(
        `/api/v1/workspaces/${fixture.workspaceId}/posts?${postsQuery({
          stage: 'pending_approval',
        })}`,
        { failOnStatusCode: false }
      );
      const pendingPosts =
        await expectJsonResponse<PostsApiResponse>(pendingPostsResponse);

      expect(pendingPosts.count).toBe(200);
      expect(
        pendingPosts.data.some(
          (row) =>
            row.approval_status === 'APPROVED' && row.queue_status === 'queued'
        )
      ).toBe(false);

      await page.goto(
        `/en/${fixture.workspaceId}/posts?${postsQuery({
          approvalStatus: 'APPROVED',
          queueStatus: 'queued',
        })}`,
        { waitUntil: 'domcontentloaded' }
      );

      await expect(page.getByRole('heading', { name: /Posts/i })).toBeVisible();
      await expect(page.getByText('Queued for delivery').first()).toBeVisible();
      await expect(page.getByText('Delivery Diagnostics')).toBeVisible();
      await expect(page.getByText('Review Stage')).toBeVisible();
      await expect(page.getByText('Delivery Status').first()).toBeVisible();

      const cronResponse = await request.get(
        '/api/cron/process-post-email-queue?debug=1&limit=200&sendLimit=200',
        {
          failOnStatusCode: false,
          headers: {
            Authorization: `Bearer ${CRON_SECRET}`,
          },
        }
      );
      const cron = await expectJsonResponse<CronResponse>(cronResponse);

      expect(cron.ok).toBe(true);
      expect(cron.claimed ?? 0).toBeLessThanOrEqual(200);
      expect(cron.processed ?? 0).toBeGreaterThanOrEqual(0);
      expect(cron.failed ?? 0).toBeGreaterThanOrEqual(0);
      expect(cron.diagnostics.queueBefore.queued).toBeGreaterThanOrEqual(
        fixture.approvedQueuedRows
      );
      expect(cron.diagnostics.queueAfter.total).toBeGreaterThan(0);
    } finally {
      if (fixture) {
        await cleanupPostEmailQueueScaleFixture({ fixture, request });
      }
    }
  });
});
