import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  generate: vi.fn(),
  resolve: vi.fn(),
  temp: vi.fn(),
  getUserById: vi.fn(),
}));
vi.mock('@ai-sdk/google', () => ({ google: () => 'model' }));
vi.mock('@tuturuuu/ai/memory', () => ({ withAiMemory: async () => 'model' }));
vi.mock('@tuturuuu/utils/ai-temp-auth', () => ({
  validateAiTempAuthRequest: f.temp,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    auth: { admin: { getUserById: f.getUserById } },
  }),
}));
vi.mock('@/lib/mail/auth', () => ({ resolveMailRouteContext: f.resolve }));
vi.mock('ai', () => ({ generateObject: f.generate }));

import { POST } from './route';

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
  f.temp.mockResolvedValue({ status: 'missing' });
  f.generate.mockResolvedValue({
    object: { subject: 'Test', content: 'Hello' },
  });
});
afterEach(() => vi.unstubAllEnvs());
it.each(cases)('%s', async (_name, user, configured, allowed) => {
  vi.stubEnv('TUTURUUU_AZURE_TENANT_ID', configured);
  // Session payload deliberately omits identity evidence; Auth must be queried.
  f.resolve.mockResolvedValue({
    ok: true,
    context: { user: { id: staff.id, email: staff.email }, supabase: {} },
  });
  f.getUserById.mockResolvedValue({ data: { user }, error: null });
  const response = await POST(
    new NextRequest('https://mail.test/api/ai/email-draft', {
      method: 'POST',
      body: JSON.stringify({ wsId: 'workspace-id' }),
    })
  );
  expect(response.status).toBe(allowed ? 200 : 403);
  if (!allowed) {
    expect(f.generate).not.toHaveBeenCalled();
    expect(await response.json()).not.toHaveProperty('content');
  }
});
it('revalidates temporary authentication too', async () => {
  f.temp.mockResolvedValue({ status: 'valid', context: { user: staff } });
  f.getUserById.mockResolvedValue({
    data: { user: { ...staff, identities: [azure('foreign')] } },
    error: null,
  });
  const response = await POST(
    new NextRequest('https://mail.test/api/ai/email-draft', {
      method: 'POST',
      body: '{}',
    })
  );
  expect(response.status).toBe(403);
  expect(f.generate).not.toHaveBeenCalled();
});
