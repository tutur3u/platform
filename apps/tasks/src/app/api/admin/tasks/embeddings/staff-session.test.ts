// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  resolve: vi.fn(),
  from: vi.fn(),
  getUserById: vi.fn(),
}));
vi.mock('@/lib/app-session-user', () => ({
  resolveAuthenticatedSessionUser: f.resolve,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({}),
  createAdminClient: async () => ({
    from: f.from,
    auth: { admin: { getUserById: f.getUserById } },
  }),
}));
vi.mock('@tuturuuu/ai/embeddings/metered', () => ({
  createMeteredTextEmbedding: vi.fn(),
  GEMINI_EMBEDDING_2_DIMENSIONS: 768,
}));
vi.mock('next/server', async () => ({
  ...(await vi.importActual<object>('next/server')),
  connection: vi.fn(),
}));

import { POST } from './generate/route';
import { GET } from './stats/route';

const staff = {
  id: 'staff-id',
  email: 'staff@tuturuuu.com',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  identities: [],
};
const azure = (tid: string) => ({ provider: 'azure', identity_data: { tid } });
const cases = [
  [
    'foreign identity',
    { ...staff, identities: [azure('foreign')] },
    'approved',
    false,
  ],
  [
    'missing configuration',
    { ...staff, identities: [azure('approved')] },
    undefined,
    false,
  ],
  [
    'approved identity',
    { ...staff, identities: [azure('approved')] },
    'approved',
    true,
  ],
  ['confirmed non-Azure', staff, undefined, true],
  [
    'unconfirmed email',
    { ...staff, email_confirmed_at: undefined },
    'approved',
    false,
  ],
  [
    'lookalike domain',
    { ...staff, email: 'staff@tuturuuu.com.example' },
    'approved',
    false,
  ],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  const query = Object.assign(
    Promise.resolve({ data: [], count: 0, error: null }),
    {
      select: vi.fn(),
      is: vi.fn(),
      limit: vi.fn(),
    }
  );
  for (const method of ['select', 'is', 'limit'] as const)
    query[method].mockReturnValue(query);
  f.from.mockReturnValue(query);
});
afterEach(() => vi.unstubAllEnvs());
for (const [name, handler] of [
  ['stats', () => GET()],
  [
    'generate',
    () =>
      POST(
        new Request('https://tasks.test/api/admin/tasks/embeddings/generate', {
          method: 'POST',
          body: '{}',
        })
      ),
  ],
] as const) {
  describe(name, () => {
    it.each(cases)('%s', async (_name, user, configured, allowed) => {
      vi.stubEnv('TUTURUUU_AZURE_TENANT_ID', configured);
      f.resolve.mockResolvedValue({
        user: { id: staff.id, email: staff.email },
        authError: null,
      });
      f.getUserById.mockResolvedValue({ data: { user }, error: null });
      const response = await handler();
      expect(response.status).toBe(allowed ? 200 : 403);
      if (!allowed) {
        expect(f.from).not.toHaveBeenCalled();
        expect(await response.text()).not.toContain('embedding');
      }
    });
  });
}
