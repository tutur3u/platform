// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  actor: vi.fn(),
  issue: vi.fn(),
  token: vi.fn(),
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: f.actor,
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  createAppSessionToken: f.token,
}));
vi.mock('@tuturuuu/internal-api/profile-media', () => ({
  createWorkspaceUserAvatarUploadUrl: f.issue,
}));
vi.mock('@tuturuuu/users-core/routes/users/avatar', () => ({
  handleGetAvatarRequest: vi.fn(),
}));
vi.mock('@/lib/legacy-head', () => ({
  createLegacyHeadHandler: () => vi.fn(),
}));

import { InternalApiError } from '@tuturuuu/internal-api/client';
import { POST } from './route';

const context = { params: Promise.resolve({ wsId: 'workspace-id' }) };
const request = () =>
  new Request('https://contacts.test/api/avatar', {
    method: 'POST',
    body: JSON.stringify({ contentType: 'image/png' }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  f.actor.mockResolvedValue({ id: 'actor-id' });
  f.token.mockReturnValue({ token: 'synthetic-app-session' });
  f.issue.mockResolvedValue({ signedUrl: 'https://web.test/upload' });
});
it('delegates the contacts actor to central optimization with a scoped app session', async () => {
  expect((await POST(request(), context)).status).toBe(200);
  expect(f.actor).toHaveBeenCalledWith('contacts');
  expect(f.token).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: 'actor-id',
      originApp: 'contacts',
      scopes: ['users:profile:write'],
    })
  );
  expect(f.issue).toHaveBeenCalledWith('workspace-id', 'image/png', {
    defaultHeaders: { Authorization: 'Bearer synthetic-app-session' },
  });
});
it('denies guests before issuing upload capabilities', async () => {
  f.actor.mockResolvedValue(null);
  expect((await POST(request(), context)).status).toBe(401);
  expect(f.issue).not.toHaveBeenCalled();
});
it('preserves quota status from the central issuer', async () => {
  f.issue.mockRejectedValue(new InternalApiError('Quota reached', 429));
  expect((await POST(request(), context)).status).toBe(429);
});
