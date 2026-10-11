import {
  APP_SESSION_COOKIE_NAME,
  type AppSessionTargetApp,
  createAppSessionToken,
} from '@tuturuuu/auth/app-session';
import { beforeEach, vi } from 'vitest';

export const actorId = '11111111-1111-4111-8111-111111111111';
export const workspaceId = '22222222-2222-4222-8222-222222222222';
export const filename =
  'lettin-notebook-33333333-3333-4333-8333-333333333333.json';
const mocks = vi.hoisted(() => ({
  member: true,
  manage: true,
  normalize: vi.fn(),
  permissions: vi.fn(),
  upload: vi.fn(),
  provider: vi.fn(),
  metadata: vi.fn(),
  finalize: vi.fn(),
  supabaseFallback: vi.fn(),
}));

export { mocks };

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalize,
  getPermissions: mocks.permissions,
  verifyWorkspaceMembershipType: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({ from: vi.fn() })),
  createClient: mocks.supabaseFallback,
}));
vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  buildAbuseRiskSubjects: () => [],
  extractIPFromHeaders: () => '127.0.0.1',
  isIPBlocked: vi.fn(),
  recordApiAuthFailure: vi.fn(),
}));
vi.mock('@/lib/infrastructure/log-drain', () => ({
  setLogDrainUserContext: vi.fn(),
}));
vi.mock(
  '@tuturuuu/storage-core/workspace-storage-provider',
  async (original) => ({
    ...(await original<
      typeof import('@tuturuuu/storage-core/workspace-storage-provider')
    >()),
    createWorkspaceStorageUploadPayload: mocks.upload,
    resolveWorkspaceStorageProvider: mocks.provider,
    getWorkspaceStorageObjectMetadataForProvider: mocks.metadata,
  })
);
vi.mock('@tuturuuu/storage-core/workspace-storage-auto-extract', () => ({
  triggerWorkspaceStorageAutoExtract: mocks.finalize,
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'notebook-copy-test-only');
  mocks.member = true;
  mocks.manage = true;
  mocks.normalize.mockImplementation(async (id) => id);
  mocks.permissions.mockImplementation(async ({ wsId }) =>
    mocks.member && wsId === workspaceId
      ? { withoutPermission: () => !mocks.manage }
      : null
  );
  mocks.provider.mockResolvedValue({ provider: 'r2', misconfigured: false });
  mocks.metadata.mockResolvedValue({
    provider: 'r2',
    path: `Lettin/${filename}`,
    fullPath: `${workspaceId}/Lettin/${filename}`,
    contentType: 'application/json',
    size: 5,
  });
  mocks.upload.mockResolvedValue({
    signedUrl: 'https://upload.example.test/object',
    path: `Lettin/${filename}`,
    provider: 'r2',
  });
  mocks.finalize.mockResolvedValue({ status: 'skipped' });
});
export const params = { params: Promise.resolve({ wsId: workspaceId }) };
export function request(
  stage: string,
  body: unknown,
  target: AppSessionTargetApp = 'lettin',
  tokenOverride?: string
) {
  const { token } = createAppSessionToken({
    targetApp: target,
    userId: actorId,
  });
  return new Request(
    `https://lettin.example.test/api/v1/workspaces/${workspaceId}/lettin/drive-copy/${stage}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: `${APP_SESSION_COOKIE_NAME}=${tokenOverride ?? token}`,
      },
      body: JSON.stringify(body),
    }
  );
}
export const uploadBody = {
  expectedActor: actorId,
  filename,
  path: 'Lettin',
  upsert: false,
  contentType: 'application/json',
  size: 5,
};
export const finalizeBody = {
  expectedActor: actorId,
  path: `Lettin/${filename}`,
  originalFilename: filename,
  contentType: 'application/json',
  provider: 'r2',
};

export function expiredToken() {
  return createAppSessionToken(
    { targetApp: 'lettin', userId: actorId, expiresInSeconds: 60 },
    { now: new Date(Date.now() - 3600000) }
  ).token;
}
