import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  room: vi.fn(),
  create: vi.fn(),
  elevated: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/education-core/education/programming-access', () => ({
  resolveProgrammingLearnerAccess: vi.fn(),
}));
vi.mock('@tuturuuu/education-core/education/programming-execution', () => ({
  enqueueProgrammingExecution: vi.fn(),
}));
vi.mock('@tuturuuu/education-core/education/programming-repository', () => ({
  createProgrammingRepository: vi.fn(),
}));
vi.mock('@tuturuuu/education-core/education/programming-service', () => ({
  getProgrammingProblem: vi.fn(),
}));
vi.mock('@tuturuuu/storage-core/playground-preview', () => ({
  playgroundPreviewResponse: vi.fn(),
}));
vi.mock('@tuturuuu/storage-core/playground-service', () => ({
  createPlayground: mocks.create,
  executePlayground: vi.fn(),
  getPlayground: vi.fn(),
  getPlaygroundMetadata: vi.fn(),
  getPlaygroundRun: vi.fn(),
}));
vi.mock('@tuturuuu/storage-core/programming-collaboration', () => ({
  programmingRoomTicket: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/account-benefits-server', () => ({
  accountPrivateRpc: mocks.elevated,
}));
vi.mock('./room-service', () => ({ callRoomService: mocks.room }));
vi.mock('../lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      readonly status: number,
      message: string
    ) {
      super(message);
    }
  },
}));

import { createMeetingPlayground } from './programming';

const access = {
  isHost: true,
  user: { id: 'actor' },
  meeting: { id: 'meeting', creator_id: 'actor' },
} as Parameters<typeof createMeetingPlayground>[0];
beforeEach(() => {
  vi.resetAllMocks();
  mocks.room.mockResolvedValue({ selection: null });
  mocks.elevated.mockResolvedValue(false);
  mocks.create.mockResolvedValue({ id: 'project' });
});
describe('meeting blank-project admission', () => {
  it('rejects participants before any room or Drive mutation', async () => {
    await expect(
      createMeetingPlayground(
        { ...access, isHost: false },
        { name: 'Project', language: 'python', empty: true }
      )
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.room).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('checks admission before creating a blank project', async () => {
    mocks.room.mockRejectedValue(new Error('meeting ended'));
    await expect(
      createMeetingPlayground(access, {
        name: 'Project',
        language: 'python',
        empty: true,
      })
    ).rejects.toThrow('meeting ended');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('passes blank initialization only after host admission', async () => {
    await createMeetingPlayground(access, {
      name: 'Project',
      language: 'python',
      empty: true,
    });
    expect(mocks.room).toHaveBeenCalledWith(access, {
      action: 'programming.read',
    });
    expect(mocks.create).toHaveBeenCalledWith(
      'actor',
      { name: 'Project', language: 'python' },
      undefined,
      { empty: true }
    );
  });
  it('rejects invalid initialization options without a Drive write', async () => {
    await expect(
      createMeetingPlayground(access, {
        name: 'Project',
        language: 'python',
        empty: 'true',
      })
    ).rejects.toThrow();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
