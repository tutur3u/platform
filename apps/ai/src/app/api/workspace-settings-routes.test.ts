import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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

describe('AI Studio workspace settings routes', () => {
  it('owns every shared workspace-settings endpoint with AI satellite auth', () => {
    expect(mocks.apps).toEqual({
      avatar: 'ai',
      avatarUpload: 'ai',
      credits: 'ai',
      workspace: 'ai',
    });

    expect(getWorkspace).toBe(mocks.workspaceGet);
    expect(updateWorkspace).toBe(mocks.workspacePut);
    expect(updateAvatar).toBe(mocks.avatarPatch);
    expect(deleteAvatar).toBe(mocks.avatarDelete);
    expect(createAvatarUpload).toBe(mocks.avatarUploadPost);
    expect(getAiCredits).toBe(mocks.creditsGet);
  });

  it('preloads the workspace before rendering shared settings panels', () => {
    const source = readFileSync(
      new URL('../../components/settings/settings-dialog.tsx', import.meta.url),
      'utf8'
    );

    expect(source).toContain('import { getWorkspace }');
    expect(source).toContain("queryKey: ['workspace', wsId]");
    expect(source).toContain('workspace={workspace ?? null}');
  });
});
