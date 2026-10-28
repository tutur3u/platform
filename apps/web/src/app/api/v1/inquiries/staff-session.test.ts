// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const f = vi.hoisted(() => ({
  resolve: vi.fn(),
  admin: vi.fn(),
  from: vi.fn(),
  getUserById: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: f.resolve,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: vi.fn(async () => ({})),
  createAdminClient: f.admin,
}));
vi.mock('@tuturuuu/ai/memory', () => ({
  rememberAiMemory: vi.fn(),
  resolveAiMemoryScope: vi.fn(),
}));
vi.mock('next/server', async () => ({
  ...(await vi.importActual<object>('next/server')),
  connection: vi.fn(),
}));

import { POST as backfill } from '@/legacy-api-routes/v1/admin/ai/memory/backfill-mira/route';
import { PATCH } from './[id]/route';
import { GET } from './route';

const staff = {
  id: 'staff-id',
  email: 'staff@tuturuuu.com',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  identities: [{ provider: 'email', identity_data: {} }],
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
    'confirmed xwf',
    { ...staff, email: 'staff@xwf.tuturuuu.com' },
    undefined,
    true,
  ],
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
      update: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      range: vi.fn(),
      single: vi.fn(),
    }
  );
  for (const method of [
    'select',
    'update',
    'eq',
    'order',
    'range',
    'single',
  ] as const)
    query[method].mockReturnValue(query);
  f.from.mockReturnValue(query);
  f.admin.mockResolvedValue({
    from: f.from,
    schema: () => ({
      from: f.from,
      rpc: async () => ({ data: 'run-id', error: null }),
    }),
    auth: { admin: { getUserById: f.getUserById } },
  });
});
afterEach(() => vi.unstubAllEnvs());
for (const [name, handler] of [
  ['inquiry list', (req: Request) => GET(req)],
  [
    'inquiry update',
    (req: Request) =>
      PATCH(req, { params: Promise.resolve({ id: 'inquiry-id' }) }),
  ],
  [
    'memory backfill',
    (req: Request) => backfill(req as Parameters<typeof backfill>[0]),
  ],
] as const) {
  describe(name, () => {
    it.each(cases)('%s', async (_name, user, configured, allowed) => {
      vi.stubEnv('TUTURUUU_AZURE_TENANT_ID', configured);
      f.resolve.mockResolvedValue({ user, authError: null });
      f.getUserById.mockResolvedValue({ data: { user }, error: null });
      const response = await handler(
        new Request('https://app.test/api/v1/inquiries', {
          method: name === 'inquiry list' ? 'GET' : 'POST',
          headers: { origin: 'https://app.test' },
          ...(name === 'inquiry list'
            ? {}
            : { body: JSON.stringify({ is_read: true }) }),
        })
      );
      expect(response.status).toBe(allowed ? 200 : 403);
      if (!allowed) {
        expect(f.from).not.toHaveBeenCalled();
        expect(await response.json()).not.toHaveProperty('data');
      }
    });
  });
}
