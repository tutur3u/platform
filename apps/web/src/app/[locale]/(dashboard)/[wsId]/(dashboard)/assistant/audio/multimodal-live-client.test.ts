import { beforeEach, describe, expect, it, vi } from 'vitest';

const { connectMock, constructorMock } = vi.hoisted(() => ({
  connectMock: vi.fn(),
  constructorMock: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    live = { connect: connectMock };

    constructor(options: unknown) {
      constructorMock(options);
    }
  },
  Modality: {
    AUDIO: 'AUDIO',
    IMAGE: 'IMAGE',
    TEXT: 'TEXT',
  },
}));

import { MultimodalLiveClient } from './multimodal-live-client';

describe('MultimodalLiveClient connection', () => {
  beforeEach(() => {
    connectMock.mockReset();
    constructorMock.mockReset();
  });

  it('uses the v1beta endpoint required by ephemeral tokens', () => {
    new MultimodalLiveClient({ apiKey: 'auth_tokens/test' });

    expect(constructorMock).toHaveBeenCalledWith({
      apiKey: 'auth_tokens/test',
      httpOptions: { apiVersion: 'v1beta' },
    });
  });

  it('rejects when Gemini closes before setup completes', async () => {
    connectMock.mockImplementation(
      ({ callbacks }: { callbacks: { onclose: (event: unknown) => void } }) => {
        queueMicrotask(() =>
          callbacks.onclose({
            code: 1008,
            reason: 'Connection policy rejected',
            wasClean: true,
          })
        );
        return new Promise(() => {});
      }
    );
    const client = new MultimodalLiveClient({ apiKey: 'auth_tokens/test' });

    await expect(
      client.connect({ model: 'gemini-3.1-flash-live-preview' })
    ).rejects.toThrow('Connection policy rejected');
  });
});
