import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  room: vi.fn(),
  create: vi.fn(),
  elevated: vi.fn(),
  metadata: vi.fn(),
  miraCode: vi.fn(),
  miraChoice: vi.fn(),
  miraChat: vi.fn(),
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
  getPlaygroundMetadata: mocks.metadata,
  getPlaygroundRun: vi.fn(),
}));
vi.mock('@tuturuuu/storage-core/programming-collaboration', () => ({
  programmingRoomTicket: vi.fn(),
  requestProgrammingMiraCode: mocks.miraCode,
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

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
vi.mock('../../live-assistant/server/demo-authority', () => ({
  readMiraDemoAuthority: vi.fn(),
}));
vi.mock('../../live-assistant/server/private-consent', () => ({
  readPrivateMiraChoice: vi.fn(),
  requirePrivateMiraChoice: mocks.miraChoice,
}));

vi.mock('./personal-chat-request', () => ({
  requestPersonalMeetChat: mocks.miraChat,
}));

import { changeMeetingProgrammingMira } from './programming-mira';
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

describe('Mira coding routes', () => {
  const selection = {
    kind: 'playground',
    id: '00000000-0000-4000-8000-000000000001',
    language: 'python',
  };
  const action = {
    action: 'resolve',
    id: '00000000-0000-4000-8000-000000000002',
    decision: 'accepted',
    selection,
  };
  it('rejects a guest before reading code or spending credits', async () => {
    await expect(
      changeMeetingProgrammingMira({ ...access, isHost: false }, action)
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.room).not.toHaveBeenCalled();
    expect(mocks.miraCode).not.toHaveBeenCalled();
  });
  it('rejects stale selection and people without playground entitlement', async () => {
    await expect(
      changeMeetingProgrammingMira(access, action)
    ).rejects.toMatchObject({ status: 409 });
    mocks.room.mockResolvedValue({ selection, generation: null });
    await expect(
      changeMeetingProgrammingMira(access, action)
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.miraCode).not.toHaveBeenCalled();
  });
  it('requires a current private choice before reading source or generating a review', async () => {
    mocks.elevated.mockResolvedValue(true);
    mocks.metadata.mockResolvedValue({ language: 'python' });
    mocks.room.mockResolvedValue({ selection, generation: null });
    mocks.miraChoice.mockRejectedValue(new Error('Consent required'));
    await expect(
      changeMeetingProgrammingMira(access, {
        selection,
        action: 'analyze',
        source: 'chat',
        intent: 'fix',
        range: { filePath: 'solution.py', startLine: 2, endLine: 2 },
      })
    ).rejects.toThrow('Consent required');
    expect(mocks.miraCode).not.toHaveBeenCalled();
    expect(mocks.miraChat).not.toHaveBeenCalled();
  });
  it('uses the persisted proposal fields and resolves only after the document write', async () => {
    const fix = {
      id: action.id,
      filePath: 'solution.py',
      startLine: 1,
      endLine: 1,
      original: 'print(1)',
      replacement: 'print(2)',
      status: 'proposed',
    };
    mocks.elevated.mockResolvedValue(true);
    mocks.metadata.mockResolvedValue({ language: 'python' });
    mocks.room
      .mockResolvedValueOnce({ selection, generation: null })
      .mockResolvedValueOnce({ fix, digest: 'fixture', until: 123 })
      .mockResolvedValueOnce({ ok: true });
    mocks.miraCode.mockResolvedValue(Response.json({ ok: true }));
    await expect(
      changeMeetingProgrammingMira(access, { ...action, replacement: 'forged' })
    ).resolves.toEqual({ ok: true });
    expect(mocks.miraCode).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'owner', resourceId: selection.id }),
      expect.objectContaining({
        id: fix.id,
        original: fix.original,
        replacement: fix.replacement,
      }),
      123
    );
    expect(mocks.room).toHaveBeenLastCalledWith(
      access,
      expect.objectContaining({ phase: 'finish' })
    );
  });
});
