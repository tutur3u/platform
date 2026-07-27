import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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
    mocks.createAiCreditsHandler(app);
    return mocks.creditsGet;
  },
  createSatelliteWorkspaceAvatarRouteHandlers: (app: string) => {
    mocks.createAvatarHandlers(app);
    return {
      DELETE: mocks.avatarDelete,
      PATCH: mocks.avatarPatch,
    };
  },
  createSatelliteWorkspaceAvatarUploadRouteHandler: (app: string) => {
    mocks.createAvatarUploadHandler(app);
    return mocks.avatarUploadPost;
  },
  createSatelliteWorkspaceRouteHandlers: (app: string) => {
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
    expect(mocks.createWorkspaceHandlers).toHaveBeenCalledWith('ai');
    expect(mocks.createAvatarHandlers).toHaveBeenCalledWith('ai');
    expect(mocks.createAvatarUploadHandler).toHaveBeenCalledWith('ai');
    expect(mocks.createAiCreditsHandler).toHaveBeenCalledWith('ai');

    expect(getWorkspace).toBe(mocks.workspaceGet);
    expect(updateWorkspace).toBe(mocks.workspacePut);
    expect(updateAvatar).toBe(mocks.avatarPatch);
    expect(deleteAvatar).toBe(mocks.avatarDelete);
    expect(createAvatarUpload).toBe(mocks.avatarUploadPost);
    expect(getAiCredits).toBe(mocks.creditsGet);
  });
});
