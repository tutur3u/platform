import { describe, expect, it, vi } from 'vitest';
import { CloudflareSfuClient } from './sfu';

function createFetchMock() {
  // Declaring the parameters is what types `mock.calls` as real tuples; a
  // zero-arg mock makes every `calls[n][1]` access a type error.
  return vi.fn(async (_url: string, _init?: RequestInit) =>
    Response.json({ ok: true })
  );
}

function getJsonBody(init: RequestInit | undefined) {
  if (typeof init?.body !== 'string') {
    throw new Error('Expected JSON request body');
  }

  return JSON.parse(init.body) as unknown;
}

describe('CloudflareSfuClient', () => {
  it('uses Cloudflare Realtime SFU Connection API paths and bearer auth', async () => {
    const fetchMock = createFetchMock();
    const client = new CloudflareSfuClient({
      apiBaseUrl: 'https://rtc.example/v1/',
      appId: 'app-1',
      appSecret: 'secret-1',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const sessionDescription = {
      sdp: 'v=0\r\n',
      type: 'offer' as const,
    };
    const tracks = [{ kind: 'audio' as const, trackName: 'mic' }];

    await client.createSession();
    await client.addTracks({
      sessionDescription,
      sessionId: 'session-1',
      tracks,
    });
    await client.renegotiate({
      sessionDescription,
      sessionId: 'session-1',
    });
    await client.closeTracks({
      sessionId: 'session-1',
      tracks,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://rtc.example/v1/apps/app-1/sessions/new',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-1',
          'Content-Type': 'application/json',
        }),
        method: 'POST',
      })
    );
    // Verified against the live API: a body of `{}` or `{autoDiscover:true}`
    // is rejected with 400 "Body JSON validation error: sessionDescription".
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://rtc.example/v1/apps/app-1/sessions/session-1/tracks/new',
      expect.objectContaining({ method: 'POST' })
    );
    expect(getJsonBody(fetchMock.mock.calls[1]?.[1])).toEqual({
      sessionDescription,
      tracks,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://rtc.example/v1/apps/app-1/sessions/session-1/renegotiate',
      expect.objectContaining({ method: 'PUT' })
    );
    expect(getJsonBody(fetchMock.mock.calls[2]?.[1])).toEqual({
      sessionDescription,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://rtc.example/v1/apps/app-1/sessions/session-1/tracks/close',
      expect.objectContaining({ method: 'PUT' })
    );
    expect(getJsonBody(fetchMock.mock.calls[3]?.[1])).toEqual({ tracks });
  });

  it('sends an offer as sessionDescription when one is supplied', async () => {
    const fetchMock = createFetchMock();
    const client = new CloudflareSfuClient({
      appId: 'app-1',
      appSecret: 'secret-1',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const sessionDescription = { sdp: 'v=0\r\n', type: 'offer' as const };

    await client.createSession(sessionDescription);

    expect(getJsonBody(fetchMock.mock.calls[0]?.[1])).toEqual({
      sessionDescription,
    });
  });

  it('carries the Cloudflare error description into the thrown error', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          errorCode: 'decoding_error',
          errorDescription: 'Body JSON validation error: sessionDescription',
        },
        { status: 400 }
      )
    );
    const client = new CloudflareSfuClient({
      appId: 'app-1',
      appSecret: 'secret-1',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(client.createSession()).rejects.toThrow(
      /cloudflare_sfu_request_failed:400.*decoding_error/u
    );
  });
});
