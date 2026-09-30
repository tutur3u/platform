import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  admin: vi.fn(),
  normalize: vi.fn(),
  membership: vi.fn(),
  preview: vi.fn(),
  connection: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({ resolveSessionAuthContext: mocks.auth }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalize,
  verifyWorkspaceMembershipType: mocks.membership,
}));
vi.mock('@/lib/calendar/mail-link-preview', () => ({
  getAuthorizedCalendarLinkPreview: mocks.preview,
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: mocks.connection,
}));

import { authorizeCalendarEventManagement } from '@/lib/calendar-event-permission';
import { GET } from './route';

const request = new Request('https://calendar.example/api');
const params = {
  params: Promise.resolve({
    wsId: 'ws',
    eventId: '11111111-1111-4111-8111-111111111111',
  }),
};
let rpc: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  rpc = vi.fn(async () => ({ data: true, error: null }));
  mocks.auth.mockResolvedValue({
    ok: true,
    user: { id: 'actor' },
    supabase: { rpc },
  });
  mocks.normalize.mockResolvedValue('ws');
  mocks.membership.mockResolvedValue({ ok: true });
  mocks.admin.mockResolvedValue({ id: 'admin' });
  mocks.preview.mockResolvedValue({ identity: { actorUserId: 'actor' } });
});
it('opts into validated Mail sessions only on this GET with existing workspace permission boundary', async () => {
  const response = await GET(request, params);
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(mocks.connection).toHaveBeenCalled();
  expect(mocks.auth).toHaveBeenCalledWith(request, {
    allowAppSessionAuth: { targetApp: ['calendar', 'tasks', 'mail'] },
  });
  expect(rpc).toHaveBeenCalledWith('has_workspace_permission', {
    p_ws_id: 'ws',
    p_user_id: 'actor',
    p_permission: 'manage_calendar',
  });
  expect(mocks.preview).toHaveBeenCalledWith({
    sbAdmin: { id: 'admin' },
    wsId: 'ws',
    userId: 'actor',
    eventId: '11111111-1111-4111-8111-111111111111',
  });
  await authorizeCalendarEventManagement(request, 'ws');
  expect(mocks.auth).toHaveBeenLastCalledWith(request, {
    allowAppSessionAuth: { targetApp: ['calendar', 'tasks'] },
  });
});
it('suppresses denied membership and permission before privileged access', async () => {
  mocks.membership.mockResolvedValue({ ok: false });
  expect((await GET(request, params)).status).toBe(403);
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.preview).not.toHaveBeenCalled();
  mocks.membership.mockResolvedValue({ ok: true });
  rpc.mockResolvedValue({ data: false, error: null });
  expect((await GET(request, params)).status).toBe(403);
  expect(mocks.admin).not.toHaveBeenCalled();
});
it('preserves invalid session failure before event access', async () => {
  mocks.auth.mockResolvedValue({
    ok: false,
    response: new Response('{}', { status: 401 }),
  });
  expect((await GET(request, params)).status).toBe(401);
  expect(mocks.admin).not.toHaveBeenCalled();
});
it('returns indistinguishable 404 for unavailable, malformed and provider-failed targets without error text', async () => {
  mocks.preview.mockResolvedValue(null);
  expect((await GET(request, params)).status).toBe(404);
  mocks.preview.mockRejectedValue(new Error('SECRET TOKEN AND PROVIDER BODY'));
  const response = await GET(request, params);
  expect(response.status).toBe(404);
  expect(await response.text()).toBe('{}');
  mocks.preview.mockClear();
  expect(
    (
      await GET(request, {
        params: Promise.resolve({ wsId: 'ws', eventId: 'invalid' }),
      })
    ).status
  ).toBe(404);
  expect(mocks.preview).not.toHaveBeenCalled();
});
