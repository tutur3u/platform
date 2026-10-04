import { ProfileUploadError } from '@tuturuuu/storage-core/profile-upload-budget';
import { NextRequest } from 'next/server';
// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ permissions: vi.fn(), ticket: vi.fn() }));
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
        context: { user: { id: string } },
        params: { wsId: string }
      ) => Promise<Response>
    ) =>
    (request: Request, context: { params: Promise<{ wsId: string }> }) =>
      context.params.then((params) =>
        handler(request, { user: { id: 'resolved-actor' } }, params)
      ),
}));
vi.mock('server-only', () => ({}));

import { POST } from './route';

const request = (filename = 'art.png') =>
  new NextRequest(
    'https://web.test/api/v1/workspaces/personal/avatar/upload-url',
    {
      method: 'POST',
      body: JSON.stringify({ filename }),
    }
  );
const context = { params: Promise.resolve({ wsId: 'personal' }) };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://web.test');
  f.permissions.mockResolvedValue({
    wsId: 'normalized-workspace',
    withoutPermission: () => false,
  });
  f.ticket.mockResolvedValue({
    signedUrl: 'https://web.test/optimized',
    filePath: 'workspaces/normalized-workspace/avatar.webp',
  });
});
it('issues an actor-budgeted workspace capability only after resolving settings permission', async () => {
  expect((await POST(request(), context)).status).toBe(200);
  expect(f.permissions).toHaveBeenCalledWith(
    expect.objectContaining({
      wsId: 'personal',
      user: { id: 'resolved-actor' },
    })
  );
  expect(f.ticket).toHaveBeenCalledWith(
    'resolved-actor',
    'avatar',
    'https://web.test',
    'normalized-workspace'
  );
});
it('never reserves a ticket for forbidden workspace access', async () => {
  f.permissions.mockResolvedValue({ withoutPermission: () => true });
  expect((await POST(request(), context)).status).toBe(403);
  expect(f.ticket).not.toHaveBeenCalled();
});
it.each(['../evil.png', 'art.svg', 'art\n.png'])(
  'rejects invalid names before ticket issuance: %s',
  async (filename) => {
    expect((await POST(request(filename), context)).status).toBe(400);
    expect(f.ticket).not.toHaveBeenCalled();
  }
);

it.each([429, 503])(
  'propagates optimized budget failure %s without returning a ticket',
  async (status) => {
    f.ticket.mockRejectedValue(
      new ProfileUploadError(
        'Shared budget unavailable',
        status,
        status === 429 ? 90 : undefined
      )
    );
    const response = await POST(request(), context);
    expect(response.status).toBe(status);
    if (status === 429) expect(response.headers.get('Retry-After')).toBe('90');
    const body = await response.json();
    expect(body).not.toHaveProperty('signedUrl');
    expect(body).not.toHaveProperty('token');
  }
);
