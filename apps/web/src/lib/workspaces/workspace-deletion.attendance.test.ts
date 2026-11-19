import { beforeEach, expect, it, vi } from 'vitest';

const { flags, createAdminClientMock, prepareMock, commitMock, rpcMock } =
  vi.hoisted(() => ({
    flags: { attendance: true },
    createAdminClientMock: vi.fn(),
    prepareMock: vi.fn(),
    commitMock: vi.fn(),
    rpcMock: vi.fn(),
  }));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));
vi.mock('@tuturuuu/meet-core/features/call/server/attendance-erasure', () => ({
  prepareWorkspaceAttendanceErasure: (...args: unknown[]) =>
    prepareMock(...args),
  commitAttendanceErasure: (...args: unknown[]) => commitMock(...args),
}));
vi.mock('@tuturuuu/realtime/meet', () => ({
  meetClassAttendanceEnabled: () => flags.attendance,
}));

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
  flags.attendance = true;
  prepareMock.mockResolvedValue({
    rooms: [
      { roomId: `${WORKSPACE}:meeting`, wsId: WORKSPACE, meetingId: 'meeting' },
    ],
    sql: { op: 'workspace', wsId: WORKSPACE },
  });
  commitMock.mockResolvedValue(undefined);
  rpcMock.mockResolvedValue({ data: 'deleted', error: null });
  createAdminClientMock.mockResolvedValue({ rpc: rpcMock });
});

function actor() {
  return {
    actorId: ACTOR,
    workspaceId: WORKSPACE,
    supabase: supabase as never,
  };
}

it('erases attendance only after the database confirms deletion', async () => {
  const order: string[] = [];
  prepareMock.mockImplementation(async () => {
    order.push('prepare');
    return { rooms: [], sql: { op: 'workspace', wsId: WORKSPACE } };
  });
  rpcMock.mockImplementation(async () => {
    order.push('delete');
    return { data: 'deleted', error: null };
  });
  commitMock.mockImplementation(async () => {
    order.push('commit');
  });
  const deleted = await deleteWorkspaceForActor(actor(), 'Class');
  expect(deleted.status).toBe(200);
  expect(order).toEqual(['prepare', 'delete', 'commit']);

  order.length = 0;
  rpcMock.mockImplementation(async () => {
    order.push('delete');
    return { data: 'subscription_active', error: null };
  });
  const denied = await deleteWorkspaceForActor(actor(), 'Class');
  expect(denied.status).toBe(409);
  expect(order).toEqual(['prepare', 'delete']);
  expect(commitMock).toHaveBeenCalledTimes(1);
});

it('does not delete the workspace when planning fails while attendance is on', async () => {
  prepareMock.mockRejectedValue(new Error('timeout'));
  await expect(deleteWorkspaceForActor(actor(), 'Class')).rejects.toThrow(
    'timeout'
  );
  expect(rpcMock).not.toHaveBeenCalled();
});

it('does not fail workspace deletion when attendance erasure is off', async () => {
  flags.attendance = false;
  prepareMock.mockRejectedValue(new Error('type error'));
  const deleted = await deleteWorkspaceForActor(actor(), 'Class');
  expect(deleted.status).toBe(200);
  expect(commitMock).not.toHaveBeenCalled();
});

it('reports failure when confirmed erasure fails while attendance is on', async () => {
  commitMock.mockRejectedValue(new Error('timeout'));
  const failed = await deleteWorkspaceForActor(actor(), 'Class');
  expect(failed.status).toBe(500);
  expect(failed.body.code).toBe('failed');
});
