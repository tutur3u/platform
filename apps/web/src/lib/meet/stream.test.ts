import { describe, expect, it } from 'vitest';
import {
  CloudflareStreamClient,
  createCloudflareStreamLiveInputBody,
  serializeMeetStreamLiveInput,
} from './stream';

describe('createCloudflareStreamLiveInputBody', () => {
  it('keeps Cloudflare Stream WebRTC recording off by default', () => {
    expect(
      createCloudflareStreamLiveInputBody({
        actorId: 'user-1',
        allowedOrigins: ['https://tumeet.me'],
        meetingId: 'meeting-1',
        meetingName: 'Weekly review',
        wsId: 'workspace-1',
      })
    ).toMatchObject({
      enabled: true,
      meta: {
        createdBy: 'user-1',
        meetingId: 'meeting-1',
        product: 'tuturuuu-meet',
        wsId: 'workspace-1',
      },
      recording: {
        allowedOrigins: ['https://tumeet.me'],
        hideLiveViewerCount: true,
        mode: 'off',
        requireSignedURLs: false,
        timeoutSeconds: 0,
      },
    });
  });
});

describe('CloudflareStreamClient', () => {
  it('creates a Stream live input with account-scoped bearer auth', async () => {
    const requests: Array<{
      body: unknown;
      headers: Headers;
      method: string;
      url: string;
    }> = [];
    const client = new CloudflareStreamClient({
      accountId: 'account-1',
      apiBaseUrl: 'https://api.example.test/client/v4',
      apiToken: 'stream-token',
      fetch: async (input, init) => {
        requests.push({
          body: init?.body ? JSON.parse(String(init.body)) : null,
          headers: new Headers(init?.headers),
          method: init?.method ?? 'GET',
          url: String(input),
        });

        return new Response(
          JSON.stringify({
            result: {
              enabled: true,
              uid: 'live-input-1',
              webRTC: { url: 'https://customer.example/webRTC/publish' },
              webRTCPlayback: { url: 'https://customer.example/webRTC/play' },
            },
            success: true,
          })
        );
      },
    });

    const result = await client.createLiveInput({
      actorId: 'user-1',
      meetingId: 'meeting-1',
      meetingName: 'Weekly review',
      wsId: 'workspace-1',
    });

    expect(result.uid).toBe('live-input-1');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.example.test/client/v4/accounts/account-1/stream/live_inputs',
    });
    expect(requests[0]?.headers.get('Authorization')).toBe(
      'Bearer stream-token'
    );
    expect(requests[0]?.body).toMatchObject({
      enabled: true,
      recording: {
        mode: 'off',
      },
    });
  });
});

describe('serializeMeetStreamLiveInput', () => {
  const stream = {
    cloudflare_live_input_enabled: true,
    cloudflare_live_input_uid: 'live-input-1',
    created_at: '2026-05-27T00:00:00.000Z',
    created_by: 'user-1',
    ended_at: null,
    id: 'stream-1',
    meeting_id: 'meeting-1',
    metadata: {},
    started_at: null,
    status: 'ready',
    updated_at: '2026-05-27T00:00:00.000Z',
    whep_url: 'https://customer.example/webRTC/play',
    whip_url: 'https://customer.example/webRTC/publish',
    ws_id: 'workspace-1',
  };

  it('excludes the WHIP publish URL from viewer responses', () => {
    expect(serializeMeetStreamLiveInput(stream)).not.toHaveProperty(
      'publishUrl'
    );
  });

  it('includes the WHIP publish URL only for host responses', () => {
    expect(
      serializeMeetStreamLiveInput(stream, { includePublishUrl: true })
    ).toMatchObject({
      playbackUrl: 'https://customer.example/webRTC/play',
      publishUrl: 'https://customer.example/webRTC/publish',
    });
  });
});
