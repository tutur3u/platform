import { describe, expect, it, vi } from 'vitest';
import { CloudflareSfuClient } from './cloudflare-sfu';

function createFetchMock() {
  return vi.fn(async () => Response.json({ ok: true }));
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
    expect(getJsonBody(fetchMock.mock.calls[0]?.[1])).toEqual({
      autoDiscover: true,
    });

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
});
