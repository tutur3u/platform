import { beforeEach, expect, it, vi } from 'vitest';

const {
  flags,
  createAdminClientMock,
  prepareMock,
  readPendingMock,
  enqueueMock,
  rpcMock,
} = vi.hoisted(() => ({
  flags: { attendance: true },
  createAdminClientMock: vi.fn(),
  prepareMock: vi.fn(),
  readPendingMock: vi.fn(),
  enqueueMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));
vi.mock('@tuturuuu/meet-core/features/call/server/attendance-erasure', () => ({
  prepareWorkspaceAttendanceErasure: (...args: unknown[]) =>
    prepareMock(...args),
  readPendingAttendanceErasure: (...args: unknown[]) =>
    readPendingMock(...args),
  enqueueAttendanceErasure: (...args: unknown[]) => enqueueMock(...args),
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
      {
        roomId: `${WORKSPACE}:meeting`,
        wsId: WORKSPACE,
        meetingId: 'meeting',
      },
    ],
    sql: { op: 'workspace', wsId: WORKSPACE },
    phase: 'planned',
  });
  readPendingMock.mockResolvedValue(null);
  enqueueMock.mockResolvedValue(undefined);
  rpcMock.mockResolvedValue({ data: 'deleted', error: null });
  createAdminClientMock.mockResolvedValue({
    rpc: rpcMock,
    schema: () => ({ rpc: rpcMock }),
  });
});

function actor() {
  return {
    actorId: ACTOR,
    workspaceId: WORKSPACE,
    supabase: supabase as never,
  };
}

it('deletes the workspace while attendance is off without loading erasure', async () => {
  flags.attendance = false;
  prepareMock.mockRejectedValue(new Error('missing migration'));
  const deleted = await deleteWorkspaceForActor(actor(), 'Class');
  expect(deleted.status).toBe(200);
  expect(deleted.body.code).toBe('deleted');
  expect(rpcMock).toHaveBeenCalledExactlyOnceWith('delete_owned_workspace', {
    p_ws_id: WORKSPACE,
    p_actor_id: ACTOR,
    p_confirmation: 'Class',
  });
  expect(prepareMock).not.toHaveBeenCalled();
  expect(enqueueMock).not.toHaveBeenCalled();
  expect(readPendingMock).not.toHaveBeenCalled();
});

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
  enqueueMock.mockImplementation(async () => {
    order.push('enqueue');
  });
  const deleted = await deleteWorkspaceForActor(actor(), 'Class');
  expect(deleted.status).toBe(200);
  expect(order).toEqual(['prepare', 'delete', 'enqueue']);

  order.length = 0;
  rpcMock.mockImplementation(async () => {
    order.push('delete');
    return { data: 'subscription_active', error: null };
  });
  const denied = await deleteWorkspaceForActor(actor(), 'Class');
  expect(denied.status).toBe(409);
  expect(order).toEqual(['prepare', 'delete']);
  expect(enqueueMock).toHaveBeenCalledTimes(1);
  expect(readPendingMock).not.toHaveBeenCalled();
});

it('enqueues a confirmed intent when the workspace is already gone', async () => {
  rpcMock.mockResolvedValue({ data: 'not_found', error: null });
  readPendingMock.mockResolvedValue({
    rooms: [],
    sql: { op: 'workspace', wsId: WORKSPACE },
    phase: 'confirmed',
    sqlDone: true,
  });
  const deleted = await deleteWorkspaceForActor(actor(), 'Class');
  expect(deleted.status).toBe(200);
  expect(deleted.body.code).toBe('deleted');
  expect(enqueueMock).toHaveBeenCalledOnce();
});

it('does not delete the workspace when planning fails', async () => {
  prepareMock.mockRejectedValue(new Error('timeout'));
  await expect(deleteWorkspaceForActor(actor(), 'Class')).rejects.toThrow(
    'timeout'
  );
  expect(rpcMock).not.toHaveBeenCalled();
});

it('reports failure when confirmed erasure fails while attendance is on', async () => {
  enqueueMock.mockRejectedValue(new Error('timeout'));
  const failed = await deleteWorkspaceForActor(actor(), 'Class');
  expect(failed.status).toBe(500);
  expect(failed.body.code).toBe('failed');
});
