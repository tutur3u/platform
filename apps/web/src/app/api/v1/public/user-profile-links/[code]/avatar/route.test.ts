import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const f = vi.hoisted(() => ({
  admin: vi.fn(),
  ticket: vi.fn(),
  single: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: f.admin,
  createClient: vi.fn(),
}));
vi.mock('@/lib/profile-media-ticket', () => ({
  createOptimizedProfileMediaTicket: f.ticket,
}));

import { POST } from './route';

const wsId = '12345678-1234-1234-1234-123456789abc';
const context = { params: Promise.resolve({ code: 'active-link' }) };
const request = () =>
  new Request('https://app.test/api/avatar', {
    method: 'POST',
    body: JSON.stringify({ contentType: 'image/png' }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  f.single.mockResolvedValue({
    data: {
      ws_id: wsId,
      requires_auth: false,
      allowed_fields: ['avatar_url'],
      is_expired: false,
      is_full: false,
      is_revoked: false,
    },
  });
  f.admin.mockResolvedValue({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: f.single }) }) }),
  });
  f.ticket.mockResolvedValue({ filePath: 'synthetic.webp' });
});
it('uses a stable verified link budget and a link-scoped optimized path', async () => {
  expect((await POST(request(), context)).status).toBe(200);
  expect((await POST(request(), context)).status).toBe(200);
  expect(f.ticket.mock.calls[0]).toEqual(f.ticket.mock.calls[1]);
  expect(f.ticket.mock.calls[0]).toEqual([
    expect.stringMatching(/^[0-9a-f-]{36}$/),
    'avatar',
    expect.any(String),
    undefined,
    `${wsId}/users/profile-link/active-link`,
  ]);
});
it.each([{ is_revoked: true }, { allowed_fields: [] }])(
  'denies unavailable or avatar-disabled links before ticket issuance',
  async (change) => {
    f.single.mockResolvedValue({
      data: {
        ws_id: wsId,
        requires_auth: false,
        allowed_fields: ['avatar_url'],
        ...change,
      },
    });
    expect((await POST(request(), context)).status).toBe(
      'is_revoked' in change && change.is_revoked ? 410 : 403
    );
    expect(f.ticket).not.toHaveBeenCalled();
  }
);
