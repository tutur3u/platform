import { describe, expect, it, vi } from 'vitest';
import {
  createLiveSession,
  executeLiveTool,
  reportLiveUsage,
} from './live-tools';

describe('executeLiveTool', () => {
  it('sends the workspace tool payload with the provided abort signal', async () => {
    const signal = new AbortController().signal;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: { success: true } }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    );

    await expect(
      executeLiveTool(
        {
          args: { query: 'workspace summary' },
          functionName: 'search_workspace',
          wsId: 'workspace-1',
        },
        { fetch: fetchMock, signal }
      )
    ).resolves.toEqual({ result: { success: true } });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/live/tools/execute'),
      expect.objectContaining({
        body: JSON.stringify({
          args: { query: 'workspace summary' },
          functionName: 'search_workspace',
          wsId: 'workspace-1',
        }),
        method: 'POST',
        signal,
      })
    );
  });
});

describe('live session metering', () => {
  it('creates a Live session with the selected credit source', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          expiresAt: '2026-08-03T08:05:00.000Z',
          liveSessionId: 'session-1',
          model: 'gemini-3.1-flash-live-preview',
          reservedCredits: 1000,
          scopeKey: 'web-assistant-live',
          token: 'token-1',
        }),
        { status: 200 }
      )
    );

    await createLiveSession(
      {
        creditSource: 'personal',
        creditWsId: 'personal-ws',
        wsId: 'workspace-1',
      },
      { fetch: fetchMock }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/live/token'),
      expect.objectContaining({
        body: JSON.stringify({
          creditSource: 'personal',
          creditWsId: 'personal-ws',
          wsId: 'workspace-1',
        }),
        method: 'POST',
      })
    );
  });

  it('reports cumulative usage with keepalive on final settlement', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          billedCredits: 42,
          closed: true,
          providerCostUsd: 0.0042,
          remainingReservedCredits: 958,
        }),
        { status: 200 }
      )
    );

    await reportLiveUsage(
      {
        close: true,
        liveSessionId: 'session-1',
        sequence: 3,
        usage: {
          inputAudioTokens: 100,
          inputImageTokens: 0,
          inputTextTokens: 10,
          inputVideoTokens: 0,
          outputAudioTokens: 50,
          outputTextTokens: 5,
          searchQueries: 1,
          thinkingTokens: 2,
        },
      },
      { fetch: fetchMock, keepalive: true }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/live/usage'),
      expect.objectContaining({ keepalive: true, method: 'POST' })
    );
  });
});
