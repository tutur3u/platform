import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeAdmin: vi.fn(),
  apps: {
    avatar: null as string | null,
    avatarUpload: null as string | null,
    credits: null as string | null,
    workspace: null as string | null,
  },
  avatarDelete: vi.fn(),
  avatarPatch: vi.fn(),
  avatarUploadPost: vi.fn(),
  createAiCreditsHandler: vi.fn(),
  createAvatarHandlers: vi.fn(),
  createAvatarUploadHandler: vi.fn(),
  createWorkspaceHandlers: vi.fn(),
  creditsGet: vi.fn(),
  workspaceGet: vi.fn(),
  workspacePut: vi.fn(),
}));

vi.mock('@/lib/infrastructure-admin-access', () => ({
  authorizeInfrastructureAdminRequest: mocks.authorizeAdmin,
}));

vi.mock('@tuturuuu/satellite/workspace-settings-route-handlers', () => ({
  createSatelliteAiCreditsRouteHandler: (app: string) => {
    mocks.apps.credits = app;
    mocks.createAiCreditsHandler(app);
    return mocks.creditsGet;
  },
  createSatelliteWorkspaceAvatarRouteHandlers: (app: string) => {
    mocks.apps.avatar = app;
    mocks.createAvatarHandlers(app);
    return {
      DELETE: mocks.avatarDelete,
      PATCH: mocks.avatarPatch,
    };
  },
  createSatelliteWorkspaceAvatarUploadRouteHandler: (app: string) => {
    mocks.apps.avatarUpload = app;
    mocks.createAvatarUploadHandler(app);
    return mocks.avatarUploadPost;
  },
  createSatelliteWorkspaceRouteHandlers: (app: string) => {
    mocks.apps.workspace = app;
    mocks.createWorkspaceHandlers(app);
    return {
      GET: mocks.workspaceGet,
      PUT: mocks.workspacePut,
    };
  },
}));

import { GET as getAiCredits } from './v1/workspaces/[wsId]/ai/credits/route';
import {
  DELETE as deleteAvatar,
  PATCH as updateAvatar,
} from './v1/workspaces/[wsId]/avatar/route';
import { POST as createAvatarUpload } from './v1/workspaces/[wsId]/avatar/upload-url/route';
import {
  GET as getWorkspace,
  PUT as updateWorkspace,
} from './workspaces/[wsId]/route';

describe('Infrastructure workspace settings routes', () => {
  it('owns every shared workspace-settings endpoint with Infra satellite auth', () => {
    expect(mocks.apps).toEqual({
      avatar: 'infra',
      avatarUpload: 'infra',
      credits: 'infra',
      workspace: 'infra',
    });

    expect(updateWorkspace).toBe(mocks.workspacePut);
    expect(updateAvatar).toBe(mocks.avatarPatch);
    expect(deleteAvatar).toBe(mocks.avatarDelete);
    expect(createAvatarUpload).toBe(mocks.avatarUploadPost);
    expect(getAiCredits).toBe(mocks.creditsGet);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeAdmin.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    });
  });
  it('denies workspace reads before invoking the shared handler', async () => {
    const request = new Request('https://example.test');
    const context = { params: Promise.resolve({ wsId: 'tenant' }) };
    const response = await getWorkspace(request, context);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    expect(mocks.authorizeAdmin).toHaveBeenCalledExactlyOnceWith(
      'view_infrastructure',
      true,
      request
    );
    expect(mocks.workspaceGet).not.toHaveBeenCalled();
  });
  it('passes the admitted request and context to the shared handler', async () => {
    const request = new Request('https://example.test');
    const context = { params: Promise.resolve({ wsId: 'tenant' }) };
    const result = Response.json({ id: 'tenant' });
    mocks.authorizeAdmin.mockResolvedValue({ ok: true });
    mocks.workspaceGet.mockResolvedValue(result);
    expect(await getWorkspace(request, context)).toBe(result);
    expect(mocks.authorizeAdmin).toHaveBeenCalledExactlyOnceWith(
      'view_infrastructure',
      true,
      request
    );
    expect(mocks.workspaceGet).toHaveBeenCalledExactlyOnceWith(
      request,
      context
    );
  });
});
