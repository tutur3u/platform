import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSatelliteAiCreditsRouteHandler,
  createSatelliteWorkspaceRouteHandlers,
} from './workspace-settings';

const {
  createAdminClient,
  getAiCreditsStatus,
  getPermissions,
  getSatelliteAppSessionUser,
} = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getAiCreditsStatus: vi.fn(),
  getPermissions: vi.fn(),
  getSatelliteAppSessionUser: vi.fn(),
}));

vi.mock('../auth', () => ({ getSatelliteAppSessionUser }));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({ getPermissions }));
vi.mock('@tuturuuu/supabase/next/server', () => ({ createAdminClient }));
vi.mock('@tuturuuu/payment-core/ai-credits-helper', async (importOriginal) => ({
  ...(await importOriginal()),
  getAiCreditsStatus,
}));

const context = { params: Promise.resolve({ wsId: 'workspace-one' }) };

describe('satellite workspace settings route handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSatelliteAppSessionUser.mockResolvedValue({
      email: 'member@example.com',
      id: 'user-1',
    });
    getPermissions.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'manage_workspace_settings',
      wsId: 'resolved-workspace-id',
    });
  });

  it('authenticates workspace reads against the owning satellite app', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: 'resolved-workspace-id', name: 'Workspace' },
      error: null,
    });
    createAdminClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })),
      })),
    });

    const response = await createSatelliteWorkspaceRouteHandlers(
      'calendar'
    ).GET(
      new Request('https://calendar.test/api/workspaces/workspace-one'),
      context
    );

    expect(response.status).toBe(200);
    expect(getSatelliteAppSessionUser).toHaveBeenCalledWith('calendar');
    expect(getPermissions).toHaveBeenCalledWith({
      user: expect.objectContaining({ id: 'user-1' }),
      wsId: 'workspace-one',
    });
    await expect(response.json()).resolves.toMatchObject({
      id: 'resolved-workspace-id',
    });
  });

  it('rejects workspace updates without the settings permission', async () => {
    getPermissions.mockResolvedValue({
      containsPermission: () => false,
      wsId: 'resolved-workspace-id',
    });

    const response = await createSatelliteWorkspaceRouteHandlers(
      'inventory'
    ).PUT(
      new Request('https://inventory.test/api/workspaces/workspace-one', {
        body: JSON.stringify({ handle: 'workspace', name: 'Workspace' }),
        method: 'PUT',
      }),
      context
    );

    expect(response.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('updates only the resolved authorized workspace', async () => {
    const workspaceSingle = vi.fn().mockResolvedValue({
      data: { personal: false },
      error: null,
    });
    const updateSelect = vi.fn().mockResolvedValue({
      data: [{ id: 'resolved-workspace-id' }],
      error: null,
    });
    const updateEq = vi.fn(() => ({ select: updateSelect }));
    const update = vi.fn(() => ({ eq: updateEq }));
    createAdminClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ single: workspaceSingle })),
        })),
        update,
      })),
    });

    const response = await createSatelliteWorkspaceRouteHandlers(
      'inventory'
    ).PUT(
      new Request('https://inventory.test/api/workspaces/workspace-one', {
        body: JSON.stringify({ handle: 'next-handle', name: 'Next name' }),
        method: 'PUT',
      }),
      context
    );

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      handle: 'next-handle',
      name: 'Next name',
    });
    expect(updateEq).toHaveBeenCalledWith('id', 'resolved-workspace-id');
  });

  it('serves AI credit status locally with the satellite user identity', async () => {
    const accessClient = { from: vi.fn() };
    createAdminClient.mockResolvedValue(accessClient);
    getAiCreditsStatus.mockResolvedValue({ remaining: 100, tier: 'FREE' });

    const response = await createSatelliteAiCreditsRouteHandler('calendar')(
      new Request(
        'https://calendar.test/api/v1/workspaces/workspace-one/ai/credits'
      ),
      context
    );

    expect(response.status).toBe(200);
    expect(getSatelliteAppSessionUser).toHaveBeenCalledWith('calendar');
    expect(getAiCreditsStatus).toHaveBeenCalledWith({
      accessClient,
      userId: 'user-1',
      wsId: 'workspace-one',
    });
  });

  it('returns 401 before privileged access when the satellite session is missing', async () => {
    getSatelliteAppSessionUser.mockResolvedValue(null);

    const response = await createSatelliteAiCreditsRouteHandler('calendar')(
      new Request(
        'https://calendar.test/api/v1/workspaces/workspace-one/ai/credits'
      ),
      context
    );

    expect(response.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(getAiCreditsStatus).not.toHaveBeenCalled();
  });
});
