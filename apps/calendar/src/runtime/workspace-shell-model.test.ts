import { beforeEach, describe, expect, it, vi } from 'vitest';

const ports = vi.hoisted(() => ({
  admin: vi.fn(),
  profile: vi.fn(),
  cookies: vi.fn(),
}));
vi.mock('@tanstack/react-start/server-only', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: vi.fn(),
  getSatelliteCurrentUser: ports.profile,
}));
vi.mock('@tuturuuu/satellite/workspace-invitation', () => ({
  getPendingWorkspaceInvitation: vi.fn(),
}));
vi.mock('@tuturuuu/satellite/workspace-layout-helpers', () => ({
  getSidebarBehaviorUpdatedAt: () => 0,
  getSidebarCollapsedState: () => false,
  parseSidebarBehavior: () => 'expanded',
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: ports.admin,
}));
vi.mock('@tuturuuu/utils/request-workspace', () => ({
  getRequestWorkspace: vi.fn(),
}));
vi.mock('./request-context', () => ({
  cookies: ports.cookies,
  headers: vi.fn(),
}));
vi.mock('./next-navigation', () => ({
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

import { workspaceShellModel } from './workspace-model.server';

const scope = {
  kind: 'workspace' as const,
  workspace: { id: 'ws-1' },
  user: { id: 'actor' },
} as unknown as Parameters<typeof workspaceShellModel>[0];

describe('workspace shell model', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    ports.cookies.mockResolvedValue({});
  });

  it('starts the profile lookup before the connection read settles', async () => {
    const order: string[] = [];
    let finishConnections: (() => void) | undefined;
    ports.admin.mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () =>
              new Promise((resolve) => {
                order.push('connections:start');
                finishConnections = () => {
                  order.push('connections:end');
                  resolve({ data: [{ id: 'connection' }] });
                };
              }),
          }),
        }),
      }),
    });
    ports.profile.mockImplementation(async () => {
      order.push('profile:start');
      return { id: 'actor' };
    });

    const pending = workspaceShellModel(scope);
    await vi.waitFor(() => expect(order).toContain('connections:start'));
    await vi.waitFor(() => expect(order).toContain('profile:start'));
    finishConnections?.();
    const model = await pending;

    expect(order.indexOf('profile:start')).toBeLessThan(
      order.indexOf('connections:end')
    );
    expect(model.calendarConnections).toEqual([{ id: 'connection' }]);
    expect(model.profile).toEqual({ id: 'actor' });
  });
});
