import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_TRANSCRIPTION_MULTIPART_REQUEST_BYTES } from './input';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  meeting: vi.fn(),
  meetingEq: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  membership: vi.fn(),
  getWorkspaceConfig: vi.fn(),
  credits: vi.fn(),
  deduct: vi.fn(),
  limiters: vi.fn(),
  limit: vi.fn(),
  generateObject: vi.fn(),
  google: vi.fn(),
  withAiMemory: vi.fn(),
  order: [] as string[],
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspaceConfig: mocks.getWorkspaceConfig,
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
  verifyWorkspaceMembershipType: mocks.membership,
}));
vi.mock('@tuturuuu/utils/api-proxy-rate-limiters', () => ({
  getRateLimiters: mocks.limiters,
}));
vi.mock('../../credits/check-credits', () => ({
  checkAiCredits: mocks.credits,
  deductAiCredits: mocks.deduct,
}));
vi.mock('@ai-sdk/google', () => ({
  google: (...args: Parameters<typeof mocks.google>) => mocks.google(...args),
}));
vi.mock('ai', () => ({
  generateObject: (...args: Parameters<typeof mocks.generateObject>) =>
    mocks.generateObject(...args),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));
vi.mock('../../memory', () => ({
  withAiMemory: (...args: Parameters<typeof mocks.withAiMemory>) =>
    mocks.withAiMemory(...args),
}));

import { createPOST } from './route';

const WS_ID = '11111111-1111-4111-8111-111111111111';
const MEETING_ID = '22222222-2222-4222-8222-222222222222';
const REFUSAL_CODE = 'LEGACY_MEETING_TRANSCRIPTION_DISABLED';

// Every injected gate a caller could previously pass to re-enable the legacy
// path, all saying "yes". The route must ignore them.
const permissiveOptions = {
  isLegacyMeetingTranscriptionEnabled: () => true,
  isMeetAiEnabled: () => true,
  limitMeetAiUsage: async () => ({ ok: true }),
};
const post = () =>
  (
    createPOST as unknown as (
      options?: unknown
    ) => ReturnType<typeof createPOST>
  )(permissiveOptions);

function createAudioFile() {
  const file = new File(['audio'], 'recording', { type: 'audio/webm' });
  const arrayBuffer = vi
    .spyOn(file, 'arrayBuffer')
    .mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer);
  return { arrayBuffer, file };
}

function createRequest({
  audio = createAudioFile().file as FormDataEntryValue | null,
  contentLength,
  locale,
  wsId = 'personal' as FormDataEntryValue | null,
  meetingId = MEETING_ID as FormDataEntryValue | null,
}: {
  audio?: FormDataEntryValue | null;
  contentLength?: string;
  locale?: string;
  wsId?: FormDataEntryValue | null;
  meetingId?: FormDataEntryValue | null;
} = {}) {
  const headers = new Headers();
  if (contentLength !== undefined) headers.set('content-length', contentLength);
  if (locale) headers.set('accept-language', locale);
  const formData = vi.fn().mockResolvedValue({
    get: vi.fn((key: string) => {
      if (key === 'audio') return audio;
      if (key === 'wsId') return wsId;
      if (key === 'meetingId') return meetingId;
      return null;
    }),
  });
  return {
    formData,
    request: { formData, headers } as unknown as Request,
  };
}

function expectNoPaidWork() {
  expect(mocks.credits).not.toHaveBeenCalled();
  expect(mocks.deduct).not.toHaveBeenCalled();
  expect(mocks.google).not.toHaveBeenCalled();
  expect(mocks.withAiMemory).not.toHaveBeenCalled();
  expect(mocks.generateObject).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.order.length = 0;
  mocks.normalizeWorkspaceId.mockResolvedValue(WS_ID);
  mocks.membership.mockImplementation(async () => {
    mocks.order.push('membership');
    return { ok: true, membershipType: 'MEMBER' };
  });
  mocks.getWorkspaceConfig.mockResolvedValue('true');
  mocks.credits.mockResolvedValue({ allowed: true });
  mocks.deduct.mockResolvedValue({ success: true });
  mocks.limit.mockResolvedValue({ success: true });
  mocks.limiters.mockResolvedValue({
    mutate: [{ limiter: { limit: mocks.limit } }],
  });
  mocks.meeting.mockImplementation(async () => {
    mocks.order.push('meeting');
    return { data: { ws_id: WS_ID, creator_id: 'user-1' }, error: null };
  });
  const query = {
    select: () => query,
    eq: (...args: unknown[]) => {
      mocks.meetingEq(...args);
      return query;
    },
    maybeSingle: mocks.meeting,
  };
  mocks.createClient.mockResolvedValue({
    from: () => query,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
  });
  mocks.google.mockReturnValue('provider-model');
  mocks.withAiMemory.mockResolvedValue('metered-model');
  mocks.generateObject.mockResolvedValue({
    usage: { inputTokens: 20, outputTokens: 10 },
    object: { text: 'Transcript' },
  });
});

describe('legacy meeting transcription is permanently refused', () => {
  it.each([
    ['with every former gate saying yes', post],
    ['with no options', () => createPOST()],
  ])(
    'refuses the meeting creator %s before audio, usage, credits or provider',
    async (_, make) => {
      const { arrayBuffer, file } = createAudioFile();
      const { request } = createRequest({ audio: file });
      const response = await make()(request);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: REFUSAL_CODE });
      expect(arrayBuffer).not.toHaveBeenCalled();
      expectNoPaidWork();
    }
  );

  it('ignores a legacy_meeting_transcription_enabled workspace config of true', async () => {
    mocks.getWorkspaceConfig.mockResolvedValue('true');
    const response = await post()(createRequest().request);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: REFUSAL_CODE });
    expect(mocks.getWorkspaceConfig).not.toHaveBeenCalled();
    expectNoPaidWork();
  });

  it('gives a non-creator member the same refusal', async () => {
    mocks.meeting.mockResolvedValue({
      data: { ws_id: WS_ID, creator_id: 'someone-else' },
      error: null,
    });
    const response = await post()(createRequest().request);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: REFUSAL_CODE });
    expectNoPaidWork();
  });

  it.each([
    ['en', 'Speaker consent cannot be verified'],
    ['en-US,en;q=0.9', 'Speaker consent cannot be verified'],
    ['vi', 'Không thể xác minh'],
    ['vi-VN,vi;q=0.9', 'Không thể xác minh'],
  ])('localizes the refusal for %s', async (locale, expected) => {
    const response = await post()(createRequest({ locale }).request);
    const body = await response.json();
    expect(body.error).toContain(expected);
    expect(body.error).toContain('Meet AI');
  });
});

describe('legacy meeting transcription admission order', () => {
  it('checks workspace membership before looking up the meeting', async () => {
    await post()(createRequest().request);
    expect(mocks.order).toEqual(['membership', 'meeting']);
  });

  it.each(['non-member', 'guest', 'lookup-error'])(
    'refuses a %s without looking up the meeting',
    async (reason) => {
      mocks.membership.mockResolvedValue({ ok: false, error: reason });
      const response = await post()(createRequest().request);
      expect(response.status).toBe(403);
      expect(await response.text()).toBe('Workspace access denied');
      expect(mocks.meeting).not.toHaveBeenCalled();
      expectNoPaidWork();
    }
  );

  it('verifies MEMBER status in the resolved workspace', async () => {
    await post()(createRequest().request);
    expect(mocks.membership).toHaveBeenCalledWith(
      expect.objectContaining({
        wsId: WS_ID,
        userId: 'user-1',
        requiredType: 'MEMBER',
      })
    );
  });

  it('scopes the meeting lookup by both id and workspace', async () => {
    await post()(createRequest().request);
    expect(mocks.meetingEq).toHaveBeenCalledWith('id', MEETING_ID);
    expect(mocks.meetingEq).toHaveBeenCalledWith('ws_id', WS_ID);
  });

  it('denies a meeting outside the workspace without the refusal body', async () => {
    mocks.meeting.mockResolvedValue({ data: null, error: null });
    const response = await post()(createRequest().request);
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('Meeting access denied');
    expectNoPaidWork();
  });

  it('fails closed when the meeting lookup errors', async () => {
    mocks.meeting.mockResolvedValue({ data: null, error: { code: 'X' } });
    const response = await post()(createRequest().request);
    expect(response.status).toBe(503);
    expectNoPaidWork();
  });

  it.each([null, '', ' ', new File(['x'], 'workspace')])(
    'requires a workspace field %s',
    async (wsId) => {
      const response = await post()(createRequest({ wsId }).request);
      expect(response.status).toBe(400);
      expect(mocks.normalizeWorkspaceId).not.toHaveBeenCalled();
      expectNoPaidWork();
    }
  );

  it.each(['invalid', 'unresolved'])(
    'denies an %s workspace before membership',
    async (reason) => {
      if (reason === 'invalid')
        mocks.normalizeWorkspaceId.mockRejectedValue(new Error('not found'));
      else mocks.normalizeWorkspaceId.mockResolvedValue('unknown-handle');
      const response = await post()(createRequest().request);
      expect(response.status).toBe(403);
      expect(mocks.membership).not.toHaveBeenCalled();
      expect(mocks.meeting).not.toHaveBeenCalled();
    }
  );

  it.each([null, '', 'invalid'])(
    'requires a valid meeting ID (%s)',
    async (meetingId) => {
      const response = await post()(createRequest({ meetingId }).request);
      expect(response.status).toBe(400);
      expect(mocks.meeting).not.toHaveBeenCalled();
      expectNoPaidWork();
    }
  );

  it('authenticates before anything else', async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: null } });
    mocks.createClient.mockResolvedValue({ auth: { getUser } });
    const { formData, request } = createRequest({
      contentLength: String(MAX_TRANSCRIPTION_MULTIPART_REQUEST_BYTES + 1),
    });
    expect((await post()(request)).status).toBe(401);
    expect(formData).not.toHaveBeenCalled();
  });

  it('rejects an oversized declared request before multipart parsing', async () => {
    const { formData, request } = createRequest({
      contentLength: String(MAX_TRANSCRIPTION_MULTIPART_REQUEST_BYTES + 1),
    });
    expect((await post()(request)).status).toBe(413);
    expect(formData).not.toHaveBeenCalled();
  });

  it('rate-limits before multipart parsing', async () => {
    mocks.limit.mockResolvedValue({
      success: false,
      reset: Date.now() + 60_000,
    });
    const { formData, request } = createRequest();
    const response = await post()(request);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBeTruthy();
    expect(formData).not.toHaveBeenCalled();
  });

  it.each(['store-null', 'no-buckets', 'get-limiters-throws', 'limit-throws'])(
    'fails closed with 503 when the rate limiter is unavailable (%s)',
    async (reason) => {
      if (reason === 'store-null') mocks.limiters.mockResolvedValue(null);
      if (reason === 'no-buckets')
        mocks.limiters.mockResolvedValue({ mutate: [] });
      if (reason === 'get-limiters-throws')
        mocks.limiters.mockRejectedValue(new Error('redis down'));
      if (reason === 'limit-throws')
        mocks.limit.mockRejectedValue(new Error('redis down'));
      const { formData, request } = createRequest();
      const response = await post()(request);
      expect(response.status).toBe(503);
      expect(response.headers.get('Retry-After')).toBeTruthy();
      expect(formData).not.toHaveBeenCalled();
      expect(mocks.membership).not.toHaveBeenCalled();
    }
  );
});
