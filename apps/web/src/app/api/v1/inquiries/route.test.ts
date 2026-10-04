// @vitest-environment node
import { expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const f = vi.hoisted(() => ({
  client: vi.fn(),
  admin: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: f.client,
  createAdminClient: f.admin,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: f.resolve,
}));
vi.mock('next/server', async () => ({
  ...(await vi.importActual<object>('next/server')),
  connection: vi.fn(),
}));

import { PATCH } from './[id]/route';
import { POST } from './route';

it.each([
  ['POST', POST],
  [
    'PATCH',
    (req: Request) =>
      PATCH(req, { params: Promise.resolve({ id: 'synthetic-inquiry' }) }),
  ],
] as const)(
  'blocks cross-origin %s cookie mutations before authentication/admin work',
  async (method, handler) => {
    vi.clearAllMocks();
    const result = await handler(
      new Request('https://app.test/api/v1/inquiries', {
        method,
        headers: { cookie: 'synthetic=invalid', origin: 'https://cross.test' },
        body: JSON.stringify({ is_read: true }),
      })
    );
    expect(result.status).toBe(403);
    expect(f.client).not.toHaveBeenCalled();
    expect(f.admin).not.toHaveBeenCalled();
  }
);
it('rejects a513-character message before Supabase work', async () => {
  vi.clearAllMocks();
  const result = await POST(
    new Request('https://app.test/api/v1/inquiries', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Synthetic',
        email: 'synthetic@example.test',
        type: 'support',
        product: 'web',
        subject: 'Synthetic',
        message: 'm'.repeat(513),
      }),
    })
  );
  expect(result.status).toBe(400);
  expect(f.client).not.toHaveBeenCalled();
  expect(f.admin).not.toHaveBeenCalled();
});
