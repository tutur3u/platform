// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from './route';

const actor = '00000000-0000-4000-8000-000000008001';
const mocks = vi.hoisted(() => ({ insert: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({
    user: { id: '00000000-0000-4000-8000-000000008001' },
  }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({}),
  createAdminClient: async () => ({ from: () => ({ insert: mocks.insert }) }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.insert.mockReturnValue({
    select: () => ({
      single: async () => ({ data: { id: 'report' }, error: null }),
    }),
  });
});
it.each(['%2e%2e', '%252e%252e', '%2f..', '%5c..'])(
  'rejects encoded media path %s before saving a report',
  async (segment) => {
    const response = await POST(
      new NextRequest('http://localhost/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          product: 'web',
          type: 'bug',
          subject: 'Fixture report',
          suggestion: 'Fixture description',
          imagePaths: [actor + '/' + segment + '/foreign.png'],
        }),
      })
    );
    expect(response.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  }
);
it('keeps ordinary actor-scoped uploads', async () => {
  const response = await POST(
    new NextRequest('http://localhost/api/reports', {
      method: 'POST',
      body: JSON.stringify({
        product: 'web',
        type: 'bug',
        subject: 'Fixture report',
        suggestion: 'Fixture description',
        imagePaths: [actor + '/photo.png'],
      }),
    })
  );
  expect(response.status).toBe(200);
});
