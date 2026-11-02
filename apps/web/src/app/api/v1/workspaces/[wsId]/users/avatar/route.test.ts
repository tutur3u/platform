import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const f = vi.hoisted(() => ({ permissions: vi.fn(), ticket: vi.fn() }));
vi.mock('@tuturuuu/users-core/routes/users/avatar', () => ({
  handleGetAvatarRequest: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: f.permissions,
}));
vi.mock('@/lib/profile-media-ticket', () => ({
  createOptimizedProfileMediaTicket: f.ticket,
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        request: Request,
        actor: { user: { id: string } },
        params: { wsId: string }
      ) => Promise<Response>
    ) =>
    (request: Request, context: { params: Promise<{ wsId: string }> }) =>
      context.params.then((params) =>
        handler(request, { user: { id: 'actor-id' } }, params)
      ),
}));

import { ProfileUploadError } from '@tuturuuu/storage-core/profile-upload-error';
import { POST } from './route';

const context = { params: Promise.resolve({ wsId: 'personal' }) };
const request = (contentType = 'image/png') =>
  new NextRequest('https://app.test/api/avatar', {
    method: 'POST',
    body: JSON.stringify({ contentType, fileName: '../forged.png' }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  f.permissions.mockResolvedValue({
    wsId: 'resolved-id',
    containsPermission: () => true,
  });
  f.ticket.mockResolvedValue({
    signedUrl: 'https://app.test/upload',
    filePath: 'resolved-id/users/ticket.webp',
  });
});
it('issues a budgeted optimizer capability for the authorized canonical workspace', async () => {
  const response = await POST(request(), context);
  expect(response.status).toBe(200);
  expect(f.ticket).toHaveBeenCalledWith(
    'actor-id',
    'avatar',
    expect.any(String),
    undefined,
    'resolved-id/users',
    'resolved-id'
  );
  expect(await response.json()).toMatchObject({
    path: 'resolved-id/users/ticket.webp',
  });
});
it('rejects non-managers before issuing a capability', async () => {
  f.permissions.mockResolvedValue({ containsPermission: () => false });
  expect((await POST(request(), context)).status).toBe(403);
  expect(f.ticket).not.toHaveBeenCalled();
});
it('rejects unsupported images before ticket reservation', async () => {
  expect((await POST(request('image/svg+xml'), context)).status).toBe(400);
  expect(f.ticket).not.toHaveBeenCalled();
});
it('surfaces the real 429 with its retry time instead of a generic failure', async () => {
  f.ticket.mockRejectedValue(
    new ProfileUploadError('Profile upload limit reached', 429, 1800)
  );
  const response = await POST(request(), context);
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBe('1800');
  expect(await response.json()).toEqual({
    message: 'Profile upload limit reached',
    code: 'PROFILE_UPLOAD_LIMIT',
    retryAfter: 1800,
  });
});
it('keeps protection outages generic and fail-closed', async () => {
  f.ticket.mockRejectedValue(
    new ProfileUploadError('Profile upload protection is unavailable', 503)
  );
  const response = await POST(request(), context);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    message: 'Avatar upload unavailable',
  });
});
