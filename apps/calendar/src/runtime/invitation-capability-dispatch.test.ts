import { NextRequest } from 'next/dist/server/web/spec-extension/request';
import { beforeEach, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({ authorize: vi.fn(), source: vi.fn() }));
vi.mock('@tanstack/react-start/server-only', () => ({}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@/lib/calendar-event-permission', () => ({
  authorizeCalendarEventManagement: boundary.authorize,
}));
vi.mock('@/lib/calendar/source-resolver', () => ({
  resolveCalendarSource: boundary.source,
}));
vi.mock('@/lib/calendar/google-color-operations/route-handlers', () => ({
  googleColorOperationModeEnabled: () => false,
}));
import {
  calendarEndpoints,
  dispatchCalendarEndpoint,
} from './api-registry.server';
import { beforeLocalApiOwner } from './api-owner-routing';

const wsId = '00000000-0000-4000-8000-000000000001';
const connectionId = '00000000-0000-4000-8000-000000000002';
const path = `/api/v1/workspaces/${wsId}/calendar/invitation-capabilities`;
beforeEach(() => {
  vi.clearAllMocks();
  boundary.authorize.mockResolvedValue({ sbAdmin: {}, wsId, userId: 'actor' });
  boundary.source.mockResolvedValue({
    provider: 'microsoft',
    connectionId,
    externalCalendarId: 'selected',
    accessToken: 'private-fixture',
  });
});
it('dispatches the generated local GET exactly once with the selected workspace and no remote owner', async () => {
  expect(beforeLocalApiOwner(path)).toBeNull();
  expect(
    calendarEndpoints.filter(
      ({ pattern }) =>
        pattern === '/api/v1/workspaces/[wsId]/calendar/invitation-capabilities'
    )
  ).toHaveLength(1);
  const remote = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('Unexpected proxy'));
  try {
    const request = new NextRequest(
      `https://calendar.test${path}?provider=microsoft&connectionId=${connectionId}`
    );
    const response = await dispatchCalendarEndpoint(request);
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({
      provider: 'microsoft',
      connectionId,
      calendarId: 'selected',
      invitationCreates: true,
    });
    expect(boundary.authorize).toHaveBeenCalledExactlyOnceWith(request, wsId);
    expect(boundary.source).toHaveBeenCalledExactlyOnceWith({
      sbAdmin: {},
      wsId,
      userId: 'actor',
      source: { provider: 'microsoft', connectionId },
    });
    expect(remote).not.toHaveBeenCalled();
  } finally {
    remote.mockRestore();
  }
});
it.each([
  ['POST', 405],
  ['OPTIONS', 204],
] as const)(
  'refuses %s safely without invoking the local handler or a proxy',
  async (method, status) => {
    const remote = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected proxy'));
    try {
      const response = await dispatchCalendarEndpoint(
        new NextRequest(`https://calendar.test${path}`, { method })
      );
      expect(response?.status).toBe(status);
      expect(response?.headers.get('allow')?.split(', ').sort()).toEqual([
        'GET',
        'HEAD',
        'OPTIONS',
      ]);
      expect(boundary.authorize).not.toHaveBeenCalled();
      expect(boundary.source).not.toHaveBeenCalled();
      expect(remote).not.toHaveBeenCalled();
    } finally {
      remote.mockRestore();
    }
  }
);
