import { beforeEach, expect, it, vi } from 'vitest';

const { imports, createAdminClientMock, rpcMock } = vi.hoisted(() => ({
  imports: { count: 0 },
  createAdminClientMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));
vi.mock('@tuturuuu/realtime/meet', () => ({
  meetClassAttendanceEnabled: () => false,
}));
vi.mock('@tuturuuu/meet-core/features/call/server/attendance-erasure', () => {
  imports.count += 1;
  throw new Error('missing migration');
});

import { deleteWorkspaceForActor } from './workspace-deletion';

const ACTOR = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const WORKSPACE = '0f1a64f7-780f-4d30-9d72-5530f204e95c';

const supabase = {
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: {
            id: WORKSPACE,
            name: 'Class',
            personal: false,
            creator_id: ACTOR,
          },
          error: null,
        }),
      }),
    }),
  }),
};

beforeEach(() => {
  vi.clearAllMocks();
  rpcMock.mockResolvedValue({ data: 'deleted', error: null });
  createAdminClientMock.mockResolvedValue({ rpc: rpcMock });
});

it('deletes the workspace while attendance storage is unavailable', async () => {
  const deleted = await deleteWorkspaceForActor(
    { actorId: ACTOR, workspaceId: WORKSPACE, supabase: supabase as never },
    'Class'
  );
  expect(deleted.status).toBe(200);
  expect(deleted.body.code).toBe('deleted');
  expect(rpcMock).toHaveBeenCalledOnce();
  expect(imports.count).toBe(0);
});

it('reports a database failure while attendance storage is unavailable', async () => {
  rpcMock.mockResolvedValue({
    data: null,
    error: { code: '57014', message: 'statement timeout' },
  });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const failed = await deleteWorkspaceForActor(
    { actorId: ACTOR, workspaceId: WORKSPACE, supabase: supabase as never },
    'Class'
  );
  expect(failed.status).toBe(500);
  expect(failed.body.code).toBe('failed');
  expect(imports.count).toBe(0);
  log.mockRestore();
});
