import type { z } from 'zod';
import type {
  cloudflareSfuSessionDescriptionSchema,
  cloudflareSfuTrackSchema,
} from '../../../packages/realtime/src/meet';

type SessionDescription = z.infer<typeof cloudflareSfuSessionDescriptionSchema>;
type SfuTrack = z.infer<typeof cloudflareSfuTrackSchema>;

export type CloudflareSfuClientOptions = {
  apiBaseUrl?: string;
  appId?: string;
  appSecret?: string;
  fetch?: typeof fetch;
};

export type AddTracksInput = {
  sessionDescription: SessionDescription;
  sessionId: string;
  tracks: SfuTrack[];
};

export type RenegotiateInput = {
  sessionDescription: SessionDescription;
  sessionId: string;
};

export type CloseTracksInput = {
  sessionId: string;
  tracks: SfuTrack[];
};

const DEFAULT_REALTIME_API_BASE_URL = 'https://rtc.live.cloudflare.com/v1';

function trimTrailingSlash(value: string) {
  return value.endsWith('/') ? trimTrailingSlash(value.slice(0, -1)) : value;
}

function getRequiredConfig(value: string | undefined, name: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} is required for Cloudflare Realtime SFU access`);
  }

  return trimmed;
}

export class CloudflareSfuClient {
  private readonly apiBaseUrl: string;
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CloudflareSfuClientOptions = {}) {
    this.apiBaseUrl = trimTrailingSlash(
      options.apiBaseUrl ||
        process.env.CLOUDFLARE_REALTIME_API_BASE_URL ||
        DEFAULT_REALTIME_API_BASE_URL
    );
    this.appId = getRequiredConfig(
      options.appId || process.env.CLOUDFLARE_REALTIME_APP_ID,
      'CLOUDFLARE_REALTIME_APP_ID'
    );
    this.appSecret = getRequiredConfig(
      options.appSecret || process.env.CLOUDFLARE_REALTIME_APP_SECRET,
      'CLOUDFLARE_REALTIME_APP_SECRET'
    );
    this.fetchImpl = options.fetch ?? fetch;
  }

  private async request(path: string, init: RequestInit = {}) {
    const response = await this.fetchImpl(
      `${this.apiBaseUrl}/apps/${encodeURIComponent(this.appId)}${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${this.appSecret}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`cloudflare_sfu_request_failed:${response.status}`);
    }

    return response.json() as Promise<unknown>;
  }

  createSession(sessionDescription?: SessionDescription) {
    return this.request('/sessions/new', {
      body: JSON.stringify(
        sessionDescription ? { sessionDescription } : { autoDiscover: true }
      ),
      method: 'POST',
    });
  }

  addTracks(input: AddTracksInput) {
    return this.request(
      `/sessions/${encodeURIComponent(input.sessionId)}/tracks/new`,
      {
        body: JSON.stringify({
          sessionDescription: input.sessionDescription,
          tracks: input.tracks,
        }),
        method: 'POST',
      }
    );
  }

  renegotiate(input: RenegotiateInput) {
    return this.request(
      `/sessions/${encodeURIComponent(input.sessionId)}/renegotiate`,
      {
        body: JSON.stringify({
          sessionDescription: input.sessionDescription,
        }),
        method: 'PUT',
      }
    );
  }

  closeTracks(input: CloseTracksInput) {
    return this.request(
      `/sessions/${encodeURIComponent(input.sessionId)}/tracks/close`,
      {
        body: JSON.stringify({ tracks: input.tracks }),
        method: 'PUT',
      }
    );
  }
}
