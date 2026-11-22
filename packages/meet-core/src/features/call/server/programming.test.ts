import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  room: vi.fn(),
  create: vi.fn(),
  elevated: vi.fn(),
  metadata: vi.fn(),
  miraCode: vi.fn(),
  miraChoice: vi.fn(),
  miraChat: vi.fn(),
  authority: vi.fn(),
  cloudflare: vi.fn(),
  ticket: vi.fn(),
  startCloud: vi.fn(),
  checkCloud: vi.fn(),
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
  programmingRoomTicket: mocks.ticket,
  requestProgrammingMiraCode: mocks.miraCode,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/account-benefits-server', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@tuturuuu/utils/account-benefits-server')
  >()),
  accountPrivateRpc: mocks.elevated,
}));
vi.mock('./room-service', () => ({ callRoomService: mocks.room }));
vi.mock('../lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      readonly status: number,
      message: string,
      readonly code?: string,
      readonly retryAfterSeconds?: number
    ) {
      super(message);
    }
  },
}));
vi.mock('@tuturuuu/storage-core/cloud-playground', () => ({
  CloudPlaygroundRefusal: class extends Error {
    readonly status: number;
    readonly code: string;
    readonly retryAfterSeconds?: number;
    // The real class is built from a service cause; tests also build a
    // refusal directly from its status, message, code and retry hint.
    constructor(
      cause: number | 'unavailable',
      message = 'Running code is unavailable',
      code = 'PLAYGROUND_UNAVAILABLE',
      retryAfterSeconds: number | undefined = 30
    ) {
      super(message);
      this.status = cause === 'unavailable' ? 503 : cause;
      this.code = code;
      this.retryAfterSeconds = retryAfterSeconds;
    }
  },
  checkCloudPlayground: mocks.checkCloud,
  isCloudPlaygroundRun: vi.fn(() => false),
  readCloudPlayground: vi.fn(),
  startCloudPlayground: mocks.startCloud,
  stopCloudPlayground: vi.fn(),
  useCloudMeetPlayground: () =>
    process.env.MEET_PLAYGROUND_EXECUTION_PROVIDER === 'cloudflare',
}));

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.cloudflare,
}));
vi.mock('../../live-assistant/server/demo-authority', () => ({
  readMiraDemoAuthority: mocks.authority,
}));
vi.mock('../../live-assistant/server/private-consent', () => ({
  readPrivateMiraChoice: vi.fn(),
  requirePrivateMiraChoice: mocks.miraChoice,
}));

vi.mock('./personal-chat-request', () => ({
  requestPersonalMeetChat: mocks.miraChat,
}));

import { changeMeetingProgrammingMira } from './programming-mira';
import { CloudPlaygroundRefusal } from '@tuturuuu/storage-core/cloud-playground';
import {
  checkMeetingProgramming,
  createMeetingPlayground,
  executeMeetingPlayground,
  joinMeetingProgramming,
} from './programming';

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

it.each(['playground', 'problem'])(
  'denies editor-initiated interactive checkpoints for %s rooms',
  async (kind) => {
    mocks.room.mockResolvedValue({
      selection: { kind, id: 'project', language: 'python' },
    });
    await expect(
      joinMeetingProgramming({ ...access, isHost: false }, true)
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.ticket).not.toHaveBeenCalled();
  }
);

it('rejects a checkpoint if the host has already closed the programming room', async () => {
  await expect(joinMeetingProgramming(access, true)).rejects.toMatchObject({
    status: 409,
  });
  expect(mocks.ticket).not.toHaveBeenCalled();
  await expect(joinMeetingProgramming(access)).resolves.toEqual({
    selection: null,
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
  function setupReview() {
    dispatch.mockClear();
    mocks.elevated.mockResolvedValue(true);
    mocks.metadata.mockResolvedValue({ language: 'python' });
    mocks.room.mockResolvedValue({ selection, generation: null });
    mocks.miraChoice.mockResolvedValue({ revision: 1 });
    mocks.cloudflare.mockResolvedValue({
      env: {
        MEET_AI_DISABLED: 'false',
        GOOGLE_GENERATIVE_AI_API_KEY: 'fixture',
      },
    });
    mocks.miraCode.mockResolvedValue(
      Response.json({
        filePath: 'solution.py',
        startLine: 2,
        endLine: 2,
        original: 'print(1)',
        digest: 'a'.repeat(64),
      })
    );
    return {
      selection,
      action: 'analyze',
      source: 'chat',
      intent: 'fix',
      range: { filePath: 'solution.py', startLine: 2, endLine: 2 },
    };
  }
  const grant = { allowed: true, authority: 'verified-personal' };
  const revoked = { allowed: false, reason: 'workspace' };
  const publish = expect.objectContaining({ phase: 'publish' });
  const dispatch = vi.fn(() => ({
    text: '{"explanation":"Review","replacement":"print(2)"}',
  }));

  it('blocks Chat provider dispatch when demo authority is revoked after code selection', async () => {
    const review = setupReview();
    mocks.authority.mockResolvedValueOnce(grant).mockResolvedValueOnce(revoked);
    mocks.miraChat.mockImplementation(async (_access, _input, provider) => {
      await provider.checkConsent();
      return dispatch();
    });
    await expect(
      changeMeetingProgrammingMira(access, review)
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.miraCode).toHaveBeenCalledOnce();
    expect(mocks.authority).toHaveBeenCalledTimes(2);
    expect(dispatch).not.toHaveBeenCalled();
    expect(mocks.room).not.toHaveBeenCalledWith(access, publish);
    expect(mocks.room).toHaveBeenLastCalledWith(
      access,
      expect.objectContaining({ phase: 'cancel' })
    );
  });

  it('blocks shared Chat publication when authority is revoked during generation', async () => {
    const review = setupReview();
    mocks.authority
      .mockResolvedValueOnce(grant)
      .mockResolvedValueOnce(grant)
      .mockResolvedValueOnce(revoked);
    mocks.miraChat.mockImplementation(async (_access, _input, provider) => {
      await provider.checkConsent();
      return dispatch();
    });
    await expect(
      changeMeetingProgrammingMira(access, review)
    ).rejects.toMatchObject({ status: 403 });
    expect(dispatch).toHaveBeenCalledOnce();
    expect(mocks.authority).toHaveBeenCalledTimes(3);
    expect(mocks.room).not.toHaveBeenCalledWith(access, publish);
    expect(mocks.room).toHaveBeenLastCalledWith(
      access,
      expect.objectContaining({ phase: 'cancel' })
    );
  });

  it('blocks sharing a Voice Live draft after demo eligibility is revoked', async () => {
    setupReview();
    mocks.authority.mockResolvedValue(revoked);
    await expect(
      changeMeetingProgrammingMira(access, {
        selection,
        action: 'publish',
        id: action.id,
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.room).not.toHaveBeenCalledWith(access, publish);
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

describe('meeting cloud Run refusals', () => {
  const projectId = '00000000-0000-4000-8000-000000000010';
  const run = {
    operation: 'run',
    requestId: '00000000-0000-4000-8000-000000000011',
  };
  beforeEach(() => {
    vi.stubEnv('MEET_PLAYGROUND_EXECUTION_PROVIDER', 'cloudflare');
    mocks.room.mockResolvedValue({
      selection: { kind: 'playground', id: projectId, language: 'python' },
    });
    mocks.elevated.mockResolvedValue(true);
    mocks.metadata.mockResolvedValue({
      language: 'python',
      revision: 3,
      activeRun: null,
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('passes the refusal code and retry hint to the room response', async () => {
    mocks.startCloud.mockRejectedValue(
      new (CloudPlaygroundRefusal as unknown as new (
        ...args: unknown[]
      ) => Error)(429, 'Playground run limit reached', 'PLAYGROUND_QUOTA', 120)
    );
    await expect(executeMeetingPlayground(access, run)).rejects.toMatchObject({
      status: 429,
      code: 'PLAYGROUND_QUOTA',
      retryAfterSeconds: 120,
    });
    expect(mocks.room).not.toHaveBeenCalledWith(
      access,
      expect.objectContaining({ action: 'programming.run' })
    );
  });

  it('reports a legacy active run as busy without dispatching', async () => {
    mocks.metadata.mockResolvedValue({
      language: 'python',
      revision: 3,
      activeRun: 'legacy-run',
    });
    await expect(executeMeetingPlayground(access, run)).rejects.toMatchObject({
      status: 429,
      code: 'PLAYGROUND_BUSY',
      retryAfterSeconds: 5,
    });
    expect(mocks.startCloud).not.toHaveBeenCalled();
  });
});

describe('meeting code checks', () => {
  const projectId = '00000000-0000-4000-8000-000000000020';
  const check = {
    requestId: '00000000-0000-4000-8000-000000000021',
    language: 'cpp',
    files: [{ path: 'main.cpp', content: 'int main() {}' }],
  };
  beforeEach(() => {
    vi.stubEnv('MEET_PLAYGROUND_EXECUTION_PROVIDER', 'cloudflare');
    mocks.room.mockResolvedValue({
      selection: { kind: 'playground', id: projectId, language: 'cpp' },
    });
    mocks.elevated.mockResolvedValue(true);
    mocks.metadata.mockResolvedValue({
      language: 'cpp',
      revision: 3,
      activeRun: null,
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('checks the room files as the caller after authorizing the selection', async () => {
    mocks.checkCloud.mockResolvedValue({ diagnostics: [] });
    await expect(checkMeetingProgramming(access, check)).resolves.toEqual({
      diagnostics: [],
    });
    expect(mocks.metadata).toHaveBeenCalledWith('actor', projectId);
    expect(mocks.checkCloud).toHaveBeenCalledWith('meeting', {
      requester: 'actor',
      ...check,
    });
  });

  it('refuses a language other than the selection before any check', async () => {
    await expect(
      checkMeetingProgramming(access, { ...check, language: 'java' })
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.checkCloud).not.toHaveBeenCalled();
  });

  it('reports checks unavailable while Meet is not on Cloudflare execution', async () => {
    vi.stubEnv('MEET_PLAYGROUND_EXECUTION_PROVIDER', '');
    await expect(checkMeetingProgramming(access, check)).rejects.toMatchObject({
      status: 503,
    });
    expect(mocks.checkCloud).not.toHaveBeenCalled();
  });

  it('passes a warming refusal and its retry hint to the room response', async () => {
    mocks.checkCloud.mockRejectedValue(
      new (CloudPlaygroundRefusal as unknown as new (
        ...args: unknown[]
      ) => Error)(503, 'Code checks are starting', 'PLAYGROUND_WARMING', 2)
    );
    await expect(checkMeetingProgramming(access, check)).rejects.toMatchObject({
      status: 503,
      code: 'PLAYGROUND_WARMING',
      retryAfterSeconds: 2,
    });
  });

  it('rejects unknown fields and oversize inventories', async () => {
    for (const payload of [
      { ...check, command: 'id' },
      { ...check, files: [] },
      {
        ...check,
        files: Array.from({ length: 21 }, (_, i) => ({
          path: `f${i}.cpp`,
          content: '',
        })),
      },
    ])
      await expect(checkMeetingProgramming(access, payload)).rejects.toThrow();
    expect(mocks.checkCloud).not.toHaveBeenCalled();
  });
});
