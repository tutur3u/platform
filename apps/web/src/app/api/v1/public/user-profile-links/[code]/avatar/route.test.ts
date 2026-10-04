// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ budget: vi.fn(), link: vi.fn(), sign: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/storage-core/profile-upload-budget', async () => {
  const actual = await vi.importActual(
    '@tuturuuu/storage-core/profile-upload-budget'
  );
  return { ...actual, reserveProfileUploadBudget: f.budget };
});
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: f.link }) }) }),
    storage: {
      from: () => ({
        createSignedUploadUrl: f.sign,
        getPublicUrl: () => ({
          data: { publicUrl: 'https://storage.test/avatar' },
        }),
      }),
    },
  }),
}));
vi.mock('@/features/user-profile-links/server', () => ({
  getLinkUnavailableReason: (link: { is_revoked?: boolean }) =>
    link.is_revoked ? 'revoked' : null,
}));

import { ProfileUploadError } from '@tuturuuu/storage-core/profile-upload-budget';
import { POST } from './route';

const request = () =>
  new Request('https://example.test/api/avatar', {
    method: 'POST',
    body: JSON.stringify({ contentType: 'image/png', actor_id: 'forged' }),
  });
const context = { params: Promise.resolve({ code: 'verified-link' }) };
beforeEach(() => {
  vi.clearAllMocks();
  f.link.mockResolvedValue({
    data: {
      ws_id: 'resolved-workspace',
      requires_auth: false,
      allowed_fields: ['avatar_url'],
    },
  });
  f.budget.mockResolvedValue(undefined);
  f.sign.mockResolvedValue({
    data: { signedUrl: 'https://storage.test/ticket' },
    error: null,
  });
});
it('budgets the verified active link before privileged signing', async () => {
  expect((await POST(request(), context)).status).toBe(200);
  expect(f.budget).toHaveBeenCalledWith(
    'profile-link:resolved-workspace:verified-link',
    'avatar'
  );
  expect(f.budget.mock.invocationCallOrder[0]).toBeLessThan(
    f.sign.mock.invocationCallOrder[0]!
  );
});
it.each([429, 503])(
  'budget failure %s never issues a privileged ticket',
  async (status) => {
    f.budget.mockRejectedValue(
      new ProfileUploadError('Denied', status, status === 429 ? 30 : undefined)
    );
    const response = await POST(request(), context);
    expect(response.status).toBe(status);
    if (status === 429) expect(response.headers.get('Retry-After')).toBe('30');
    expect(f.sign).not.toHaveBeenCalled();
  }
);
it('revoked links cannot consume budgets or issue tickets', async () => {
  f.link.mockResolvedValue({
    data: { is_revoked: true, requires_auth: false },
  });
  expect((await POST(request(), context)).status).toBe(410);
  expect(f.budget).not.toHaveBeenCalled();
  expect(f.sign).not.toHaveBeenCalled();
});

it.each(['image/svg+xml', 'image/avif', 'text/plain'])(
  'rejects unsupported MIME %s before reserving or signing',
  async (contentType) => {
    const response = await POST(
      new Request('https://example.test/api/avatar', {
        method: 'POST',
        body: JSON.stringify({ contentType }),
      }),
      context
    );
    expect(response.status).toBe(400);
    expect(f.budget).not.toHaveBeenCalled();
    expect(f.sign).not.toHaveBeenCalled();
  }
);

it.each([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
])('uses the validated %s extension', async (contentType, extension) => {
  const response = await POST(
    new Request('https://example.test/api/avatar', {
      method: 'POST',
      body: JSON.stringify({ contentType }),
    }),
    context
  );
  expect(response.status).toBe(200);
  expect(f.sign).toHaveBeenCalledWith(
    expect.stringMatching(new RegExp(`\\.${extension}$`))
  );
});
