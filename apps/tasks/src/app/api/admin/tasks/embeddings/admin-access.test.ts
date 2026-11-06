import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), generate: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({}),
  createAdminClient: mocks.admin,
}));
vi.mock('@/lib/app-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({
    user: { id: 'staff', email: 'staff@tuturuuu.com' },
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: async () => ({
    containsPermission: () => false,
    withoutPermission: () => true,
  }),
}));
vi.mock('@tuturuuu/ai/embeddings/metered', () => ({
  createMeteredTextEmbedding: mocks.generate,
  GEMINI_EMBEDDING_2_DIMENSIONS: 768,
}));
beforeEach(() => vi.clearAllMocks());
describe('SR-255 embedding administration', () => {
  it('denies statistics to staff without root AI permission', async () => {
    const { GET } = await import('./stats/route');
    expect((await GET()).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('denies generation to staff without root AI permission', async () => {
    const { POST } = await import('./generate/route');
    expect(
      (
        await POST(
          new Request('http://localhost/api/admin/tasks/embeddings/generate', {
            method: 'POST',
            body: '{}',
          })
        )
      ).status
    ).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => undefined,
}));
