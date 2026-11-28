import type {
  CloudflareSfuSessionDescription as SessionDescription,
  CloudflareSfuTrack as SfuTrack,
} from './primitives';

export type CloudflareSfuClientOptions = {
  apiBaseUrl?: string;
  appId?: string;
  appSecret?: string;
  fetch?: typeof fetch;
};

export type AddTracksInput = {
  /** Absent when pulling remote tracks; Cloudflare then returns the offer. */
  sessionDescription?: SessionDescription;
  sessionId: string;
  tracks: SfuTrack[];
};

export type RenegotiateInput = {
  sessionDescription: SessionDescription;
  sessionId: string;
};

export type CloseTracksInput = {
  force?: boolean;
  sessionId: string;
  tracks: SfuTrack[];
};

const DEFAULT_REALTIME_API_BASE_URL = 'https://rtc.live.cloudflare.com/v1';

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? trimTrailingSlash(value.slice(0, -1)) : value;
}

function getRequiredConfig(value: string | undefined, name: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} is required for Cloudflare Realtime SFU access`);
  }

  return trimmed;
}

export class CloudflareSfuError extends Error {
  readonly status: number;
  readonly errorCode?: string;
  readonly errorDescription?: string;

  constructor(
    message: string,
    status: number,
    errorCode?: string,
    errorDescription?: string
  ) {
    super(message);
    this.name = 'CloudflareSfuError';
    this.status = status;
    this.errorCode = errorCode;
    this.errorDescription = errorDescription;
  }
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
    // Workers requires the global receiver when invoking native fetch.
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
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
      // Cloudflare returns `{errorCode, errorDescription}`; surfacing it is the
      // difference between a diagnosable failure and a bare status code.
      const detail = await response.text().catch(() => '');
      let errorCode: string | undefined;
      let errorDescription: string | undefined;
      if (detail) {
        try {
          const parsed: unknown = JSON.parse(detail);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const payload = parsed as {
              errorCode?: unknown;
              errorDescription?: unknown;
            };
            if (typeof payload.errorCode === 'string') {
              const trimmed = payload.errorCode.trim();
              if (trimmed) errorCode = trimmed;
            }
            if (typeof payload.errorDescription === 'string') {
              const trimmed = payload.errorDescription.trim();
              if (trimmed) errorDescription = trimmed;
            }
          }
        } catch {
          // Non-JSON provider body; status and snippet remain on the message.
        }
      }
      throw new CloudflareSfuError(
        `cloudflare_sfu_request_failed:${response.status}${
          detail ? ` ${detail.slice(0, 300)}` : ''
        }`,
        response.status,
        errorCode,
        errorDescription
      );
    }

    return response.json() as Promise<unknown>;
  }

  /**
   * Creating a session without a local offer must send no body at all. An empty
   * object, or the `autoDiscover` flag this used to send, is rejected with
   * `400 Body JSON validation error: sessionDescription`.
   */
  createSession(sessionDescription?: SessionDescription) {
    return this.request('/sessions/new', {
      ...(sessionDescription
        ? { body: JSON.stringify({ sessionDescription }) }
        : {}),
      method: 'POST',
    });
  }

  getSession(sessionId: string) {
    return this.request(`/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
    });
  }

  addTracks(input: AddTracksInput) {
    // `kind` is room authorization metadata, not a Connection API track field.
    const tracks = input.tracks.map(({ kind: _kind, ...track }) => track);
    return this.request(
      `/sessions/${encodeURIComponent(input.sessionId)}/tracks/new`,
      {
        body: JSON.stringify({
          sessionDescription: input.sessionDescription,
          tracks,
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

  /** Changes a subscribed track's simulcast layer without renegotiation. */
  updateTracks(input: Omit<CloseTracksInput, 'force'>) {
    return this.request(
      `/sessions/${encodeURIComponent(input.sessionId)}/tracks/update`,
      {
        body: JSON.stringify({ tracks: input.tracks }),
        method: 'PUT',
      }
    );
  }

  closeTracks(input: CloseTracksInput) {
    return this.request(
      `/sessions/${encodeURIComponent(input.sessionId)}/tracks/close`,
      {
        body: JSON.stringify({
          tracks: input.tracks,
          ...(input.force === undefined ? {} : { force: input.force }),
        }),
        method: 'PUT',
      }
    );
  }
}
