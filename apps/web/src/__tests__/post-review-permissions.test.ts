import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  permissions: vi.fn(),
  posts: vi.fn(),
  admin: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@/lib/posts/data', () => ({ getPostsPageData: mocks.posts }));
vi.mock('@/lib/posts/search-params.server', () => ({
  loadPostsSearchParams: () => ({}),
}));
vi.mock('@/lib/post-email-queue', () => ({
  getPostEmailMaxAgeCutoff: vi.fn(),
  getPostEmailQueueRows: vi.fn(),
  summarizePostEmailQueue: vi.fn(),
}));

import { GET as filters } from '../legacy-api-routes/v1/workspaces/[wsId]/posts/filter-options/route';
import { GET as posts } from '../legacy-api-routes/v1/workspaces/[wsId]/posts/route';
import { GET as status } from '../legacy-api-routes/v1/workspaces/[wsId]/posts/status/route';

function allow(...names: string[]) {
  mocks.permissions.mockResolvedValue({
    wsId: 'ws-a',
    containsPermission: (p: string) => names.includes(p),
  });
}
const context = () => ({ params: Promise.resolve({ wsId: 'ws-a' }) });
const request = () => new NextRequest('https://example.invalid/posts');
beforeEach(() => {
  vi.clearAllMocks();
  allow();
  mocks.posts.mockResolvedValue({
    postsData: {
      data: [
        {
          id: 'post-a',
          email: 'synthetic@example.invalid',
          recipient: 'synthetic@example.invalid',
          user_phone: 'test-phone',
        },
      ],
      count: 1,
    },
    postsStatus: {},
  });
});
describe('post review access', () => {
  it.each([posts, filters, status])(
    'SR-213 denies review surfaces without post permissions',
    async (handler) => {
      expect((await handler(request(), context())).status).toBe(403);
      expect(mocks.posts).not.toHaveBeenCalled();
      expect(mocks.admin).not.toHaveBeenCalled();
    }
  );
  it('retains post content while masking contact fields for post readers', async () => {
    allow('view_user_groups_posts');
    const response = await posts(request(), context());
    expect(response.status).toBe(200);
    expect((await response.json()).data[0]).toMatchObject({
      id: 'post-a',
      email: null,
      recipient: null,
      user_phone: null,
    });
  });
  it('retains contacts for private-info approvers', async () => {
    allow('approve_posts', 'view_users_private_info');
    expect(
      (await (await posts(request(), context())).json()).data[0].email
    ).toBe('synthetic@example.invalid');
  });
});
