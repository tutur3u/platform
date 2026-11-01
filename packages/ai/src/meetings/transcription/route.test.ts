import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_INLINE_TRANSCRIPTION_AUDIO_BYTES,
  MAX_TRANSCRIPTION_MULTIPART_REQUEST_BYTES,
} from './input';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  membership: vi.fn(),
  credits: vi.fn(),
  deduct: vi.fn(),
  limiters: vi.fn(),
  limit: vi.fn(),
  generateObject: vi.fn(),
  google: vi.fn(),
  withAiMemory: vi.fn(),
  meetAi: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
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

const post = () => createPOST({ isMeetAiEnabled: mocks.meetAi });

function createAudioFile({
  size = 1,
  type = 'audio/webm',
}: {
  size?: number;
  type?: string;
} = {}) {
  const file = new File(['audio'], 'recording', { type });
  Object.defineProperty(file, 'size', { configurable: true, value: size });
  const arrayBuffer = vi
    .spyOn(file, 'arrayBuffer')
    .mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer);
  return { arrayBuffer, file };
}

function createRequest({
  audio = null,
  contentLength,
  wsId = 'personal',
}: {
  audio?: FormDataEntryValue | null;
  contentLength?: string;
  wsId?: FormDataEntryValue | null;
} = {}) {
  const headers = new Headers();
  if (contentLength !== undefined) {
    headers.set('content-length', contentLength);
  }
  const formData = vi.fn().mockResolvedValue({
    get: vi.fn((key: string) => {
      if (key === 'audio') return audio;
      if (key === 'wsId') return wsId;
      return null;
    }),
  });
  return {
    formData,
    request: { formData, headers } as unknown as Request,
  };
}

function expectNoAiSetup() {
  expect(mocks.google).not.toHaveBeenCalled();
  expect(mocks.withAiMemory).not.toHaveBeenCalled();
  expect(mocks.generateObject).not.toHaveBeenCalled();
}

describe('meeting transcription route input bounds', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.normalizeWorkspaceId.mockResolvedValue(
      '11111111-1111-4111-8111-111111111111'
    );
    mocks.membership.mockResolvedValue({ ok: true, membershipType: 'MEMBER' });
    mocks.meetAi.mockResolvedValue(true);
    mocks.credits.mockResolvedValue({ allowed: true });
    mocks.deduct.mockResolvedValue({ success: true });
    mocks.limit.mockResolvedValue({ success: true });
    mocks.limiters.mockResolvedValue({
      mutate: [{ limiter: { limit: mocks.limit } }],
    });
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
        }),
      },
    });
    mocks.google.mockReturnValue('provider-model');
    mocks.withAiMemory.mockResolvedValue('metered-model');
    mocks.generateObject.mockResolvedValue({
      usage: { inputTokens: 20, outputTokens: 10 },
      object: {
        durationInSeconds: 1,
        language: 'en',
        segments: [],
        text: 'Transcript',
      },
    });
  });

  it.each([null, '', ' ', new File(['x'], 'workspace')])(
    'requires a workspace field %s before reading audio',
    async (wsId) => {
      const { arrayBuffer, file } = createAudioFile();
      const { request } = createRequest({ audio: file, wsId });
      expect((await post()(request)).status).toBe(400);
      expect(arrayBuffer).not.toHaveBeenCalled();
      expect(mocks.normalizeWorkspaceId).not.toHaveBeenCalled();
      expectNoAiSetup();
    }
  );

  it.each([
    'invalid',
    'unresolved',
    'non-member',
    'guest',
    'lookup-error',
    'credits',
    'rate-limit',
  ])('rejects %s before audio allocation or provider setup', async (reason) => {
    if (reason === 'invalid')
      mocks.normalizeWorkspaceId.mockRejectedValue(new Error('not found'));
    if (reason === 'unresolved')
      mocks.normalizeWorkspaceId.mockResolvedValue('unknown-handle');
    if (['non-member', 'guest', 'lookup-error'].includes(reason)) {
      mocks.membership.mockResolvedValue({ ok: false, error: reason });
    }
    if (reason === 'credits')
      mocks.credits.mockResolvedValue({
        allowed: false,
        errorCode: 'CREDITS_EXHAUSTED',
        errorMessage: 'AI credits insufficient',
      });
    if (reason === 'rate-limit')
      mocks.limit.mockResolvedValue({
        success: false,
        reset: Date.now() + 60_000,
      });
    const { arrayBuffer, file } = createAudioFile();
    const { formData, request } = createRequest({ audio: file });
    const response = await post()(request);
    expect(response.status).toBe(reason === 'rate-limit' ? 429 : 403);
    if (reason === 'rate-limit') {
      expect(response.headers.get('Retry-After')).toBeTruthy();
      expect(formData).not.toHaveBeenCalled();
      expect(mocks.credits).not.toHaveBeenCalled();
    }
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(mocks.deduct).not.toHaveBeenCalled();
    expectNoAiSetup();
  });

  it.each(['not-allowlisted', 'lookup-throws', 'lookup-rejects', 'no-gate'])(
    'fails closed on the Meet AI allowlist (%s) before credits, file reads or the provider',
    async (reason) => {
      if (reason === 'not-allowlisted') mocks.meetAi.mockResolvedValue(false);
      if (reason === 'lookup-throws')
        mocks.meetAi.mockImplementation(() => {
          throw new Error('binding read failed');
        });
      if (reason === 'lookup-rejects')
        mocks.meetAi.mockRejectedValue(new Error('binding read failed'));
      const { arrayBuffer, file } = createAudioFile();
      const { request } = createRequest({ audio: file });
      const handler =
        reason === 'no-gate'
          ? createPOST()
          : createPOST({ isMeetAiEnabled: mocks.meetAi });
      const response = await handler(request);
      expect(response.status).toBe(403);
      expect(await response.text()).toBe('Meet AI is temporarily unavailable');
      if (reason !== 'no-gate') {
        expect(mocks.meetAi).toHaveBeenCalledWith(
          '11111111-1111-4111-8111-111111111111'
        );
      }
      expect(mocks.membership).toHaveBeenCalledOnce();
      expect(mocks.credits).not.toHaveBeenCalled();
      expect(arrayBuffer).not.toHaveBeenCalled();
      expect(mocks.deduct).not.toHaveBeenCalled();
      expectNoAiSetup();
    }
  );

  it('does not consult the allowlist for a non-member', async () => {
    mocks.membership.mockResolvedValue({ ok: false, error: 'non-member' });
    const { file } = createAudioFile();
    const { request } = createRequest({ audio: file });
    expect((await post()(request)).status).toBe(403);
    expect(mocks.meetAi).not.toHaveBeenCalled();
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
      const { arrayBuffer, file } = createAudioFile();
      const { formData, request } = createRequest({ audio: file });
      const response = await post()(request);
      expect(response.status).toBe(503);
      expect(response.headers.get('Retry-After')).toBeTruthy();
      expect(formData).not.toHaveBeenCalled();
      expect(mocks.membership).not.toHaveBeenCalled();
      expect(mocks.meetAi).not.toHaveBeenCalled();
      expect(mocks.credits).not.toHaveBeenCalled();
      expect(arrayBuffer).not.toHaveBeenCalled();
      expectNoAiSetup();
    }
  );

  it.each(['personal', 'team-handle'])(
    'attributes %s to its resolved workspace',
    async (wsId) => {
      const { file } = createAudioFile();
      const { request } = createRequest({ audio: file, wsId });
      const response = await post()(request);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        text: 'Transcript',
        segments: [],
        language: 'en',
        durationInSeconds: 1,
      });
      expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
        wsId,
        expect.anything()
      );
      expect(mocks.membership).toHaveBeenCalledWith(
        expect.objectContaining({
          wsId: '11111111-1111-4111-8111-111111111111',
          userId: 'user-1',
          requiredType: 'MEMBER',
        })
      );
      expect(mocks.credits).toHaveBeenCalledWith(
        '11111111-1111-4111-8111-111111111111',
        'gemini-3.1-flash-lite',
        'generate',
        { userId: 'user-1' }
      );
      expect(mocks.withAiMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          wsId: '11111111-1111-4111-8111-111111111111',
          product: 'meetings',
        })
      );
      expect(mocks.deduct).toHaveBeenCalledWith(
        expect.objectContaining({
          wsId: '11111111-1111-4111-8111-111111111111',
          feature: 'generate',
          inputTokens: 20,
          outputTokens: 10,
        })
      );
      expect(mocks.generateObject).toHaveBeenCalledOnce();
    }
  );

  it('authenticates before rejecting an oversized declared request', async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: null } });
    mocks.createClient.mockResolvedValue({ auth: { getUser } });
    const { formData, request } = createRequest({
      contentLength: String(MAX_TRANSCRIPTION_MULTIPART_REQUEST_BYTES + 1),
    });

    const response = await post()(request);

    expect(response.status).toBe(401);
    expect(getUser).toHaveBeenCalledOnce();
    expect(formData).not.toHaveBeenCalled();
    expectNoAiSetup();
  });

  it('rejects an oversized declared request before multipart parsing', async () => {
    const { formData, request } = createRequest({
      contentLength: String(MAX_TRANSCRIPTION_MULTIPART_REQUEST_BYTES + 1),
    });

    const response = await post()(request);

    expect(response.status).toBe(413);
    expect(formData).not.toHaveBeenCalled();
    expectNoAiSetup();
  });

  it.each([undefined, 'invalid', '-1'])(
    'treats %s content length as unknown and uses the authoritative file check',
    async (contentLength) => {
      const { arrayBuffer, file } = createAudioFile({
        size: MAX_INLINE_TRANSCRIPTION_AUDIO_BYTES + 1,
      });
      const { formData, request } = createRequest({
        audio: file,
        contentLength,
      });

      const response = await post()(request);

      expect(response.status).toBe(413);
      expect(formData).toHaveBeenCalledOnce();
      expect(arrayBuffer).not.toHaveBeenCalled();
      expectNoAiSetup();
    }
  );

  it('does not trust a small declared length over the actual file size', async () => {
    const { arrayBuffer, file } = createAudioFile({
      size: MAX_INLINE_TRANSCRIPTION_AUDIO_BYTES + 1,
    });
    const { request } = createRequest({ audio: file, contentLength: '1' });

    const response = await post()(request);

    expect(response.status).toBe(413);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expectNoAiSetup();
  });

  it.each([null, 'not-a-file'])(
    'rejects missing or non-File audio entry %s before AI setup',
    async (audio) => {
      const { request } = createRequest({ audio });

      const response = await post()(request);

      expect(response.status).toBe(400);
      expectNoAiSetup();
    }
  );

  it('rejects an empty File before allocating its byte buffer', async () => {
    const { arrayBuffer, file } = createAudioFile({ size: 0 });
    const { request } = createRequest({ audio: file });

    const response = await post()(request);

    expect(response.status).toBe(400);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expectNoAiSetup();
  });

  it.each(['audio/wav', 'video/webm', 'application/octet-stream'])(
    'rejects unsupported media type %s before allocating its byte buffer',
    async (type) => {
      const { arrayBuffer, file } = createAudioFile({ type });
      const { request } = createRequest({ audio: file });

      const response = await post()(request);

      expect(response.status).toBe(415);
      expect(arrayBuffer).not.toHaveBeenCalled();
      expectNoAiSetup();
    }
  );

  it.each([
    ['audio/webm', 'audio/webm'],
    ['audio/webm;codecs=opus', 'audio/webm'],
    ['audio/mp4', 'audio/mp4'],
    ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4'],
    ['audio/ogg', 'audio/ogg'],
    ['audio/ogg;codecs=opus', 'audio/ogg'],
    ['audio/mpeg', 'audio/mpeg'],
    ['audio/mpeg;codecs=mp3', 'audio/mpeg'],
  ] as const)(
    'passes %s to the provider as %s',
    async (type, expectedMediaType) => {
      const { arrayBuffer, file } = createAudioFile({ type });
      const { request } = createRequest({ audio: file });

      const response = await post()(request);

      expect(response.status).toBe(200);
      expect(arrayBuffer).toHaveBeenCalledOnce();
      expect(mocks.google).toHaveBeenCalledWith('gemini-3.1-flash-lite');
      expect(mocks.withAiMemory).toHaveBeenCalledOnce();
      expect(mocks.generateObject).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              content: [
                expect.objectContaining({
                  data: expect.any(Uint8Array),
                  mediaType: expectedMediaType,
                  type: 'file',
                }),
              ],
              role: 'user',
            },
          ],
        })
      );
    }
  );
});
