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

describe('MultimodalLiveClient protocol', () => {
  let callbacks: {
    onmessage: (message: unknown) => void;
    onclose: (event: unknown) => void;
  };
  const session = { close: vi.fn(), sendRealtimeInput: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks();
    connectMock.mockImplementation((options) => {
      callbacks = options.callbacks;
      return Promise.resolve(session);
    });
  });
  it('passes resumption without overriding ephemeral tool constraints', async () => {
    const client = new MultimodalLiveClient({ apiKey: 'auth_tokens/test' });
    await client.connect({
      model: 'gemini-3.1-flash-live-preview',
      sessionResumption: { handle: 'resume-1' },
    });
    expect(connectMock.mock.calls.at(-1)?.[0].config).toEqual({
      sessionResumption: { handle: 'resume-1' },
    });
  });
  it('emits both transcripts before finishing a compound message', async () => {
    const client = new MultimodalLiveClient({ apiKey: 'auth_tokens/test' });
    const events: string[] = [];
    client.on('inputtranscription', (text) => events.push(`user:${text}`));
    client.on('transcription', (text) => events.push(`assistant:${text}`));
    client.on('turncomplete', () => events.push('complete'));
    client.on('sessionresumptionupdate', () => events.push('resumption'));
    await client.connect({ model: 'gemini-3.1-flash-live-preview' });
    callbacks.onmessage({
      sessionResumptionUpdate: { resumable: true, newHandle: 'next' },
      serverContent: {
        inputTranscription: { text: 'Hello' },
        outputTranscription: { text: 'Hi' },
        turnComplete: true,
      },
    });
    expect(events).toEqual([
      'resumption',
      'user:Hello',
      'assistant:Hi',
      'complete',
    ]);
  });
  it('ends audio input and ignores a stale connection close', async () => {
    const client = new MultimodalLiveClient({ apiKey: 'auth_tokens/test' });
    await client.connect({ model: 'gemini-3.1-flash-live-preview' });
    const stale = callbacks;
    client.sendAudioStreamEnd();
    expect(session.sendRealtimeInput).toHaveBeenCalledWith({
      audioStreamEnd: true,
    });
    client.disconnect();
    await client.connect({ model: 'gemini-3.1-flash-live-preview' });
    stale.onclose({ reason: 'old connection', code: 1000, wasClean: true });
    expect(client.ws).toBe(session);
  });
});
