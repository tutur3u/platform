import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_INLINE_TRANSCRIPTION_AUDIO_BYTES,
  MAX_TRANSCRIPTION_MULTIPART_REQUEST_BYTES,
} from './input';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  generateObject: vi.fn(),
  google: vi.fn(),
  withAiMemory: vi.fn(),
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
}: {
  audio?: FormDataEntryValue | null;
  contentLength?: string;
} = {}) {
  const headers = new Headers();
  if (contentLength !== undefined) {
    headers.set('content-length', contentLength);
  }
  const formData = vi.fn().mockResolvedValue({
    get: vi.fn((key: string) => {
      if (key === 'audio') return audio;
      if (key === 'wsId') return 'workspace-1';
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
    vi.clearAllMocks();
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
      object: {
        durationInSeconds: 1,
        language: 'en',
        segments: [],
        text: 'Transcript',
      },
    });
  });

  it('authenticates before rejecting an oversized declared request', async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: null } });
    mocks.createClient.mockResolvedValue({ auth: { getUser } });
    const { formData, request } = createRequest({
      contentLength: String(MAX_TRANSCRIPTION_MULTIPART_REQUEST_BYTES + 1),
    });

    const response = await createPOST()(request);

    expect(response.status).toBe(401);
    expect(getUser).toHaveBeenCalledOnce();
    expect(formData).not.toHaveBeenCalled();
    expectNoAiSetup();
  });

  it('rejects an oversized declared request before multipart parsing', async () => {
    const { formData, request } = createRequest({
      contentLength: String(MAX_TRANSCRIPTION_MULTIPART_REQUEST_BYTES + 1),
    });

    const response = await createPOST()(request);

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

      const response = await createPOST()(request);

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

    const response = await createPOST()(request);

    expect(response.status).toBe(413);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expectNoAiSetup();
  });

  it.each([null, 'not-a-file'])(
    'rejects missing or non-File audio entry %s before AI setup',
    async (audio) => {
      const { request } = createRequest({ audio });

      const response = await createPOST()(request);

      expect(response.status).toBe(400);
      expectNoAiSetup();
    }
  );

  it('rejects an empty File before allocating its byte buffer', async () => {
    const { arrayBuffer, file } = createAudioFile({ size: 0 });
    const { request } = createRequest({ audio: file });

    const response = await createPOST()(request);

    expect(response.status).toBe(400);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expectNoAiSetup();
  });

  it.each(['audio/wav', 'video/webm', 'application/octet-stream'])(
    'rejects unsupported media type %s before allocating its byte buffer',
    async (type) => {
      const { arrayBuffer, file } = createAudioFile({ type });
      const { request } = createRequest({ audio: file });

      const response = await createPOST()(request);

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

      const response = await createPOST()(request);

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
