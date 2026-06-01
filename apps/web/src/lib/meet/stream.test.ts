import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { MeetStreamLiveInput } from '@tuturuuu/types/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CloudflareStreamClient,
  createCloudflareStreamLiveInputBody,
  ensureMeetStreamLiveInput,
  serializeMeetStreamLiveInput,
} from './stream';

function createStreamRow(
  overrides: Partial<MeetStreamLiveInput> = {}
): MeetStreamLiveInput {
  return {
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
    ...overrides,
  };
}

type SupabaseErrorMock = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message: string;
};

type QueryResult<T> = {
  data: T | null;
  error: SupabaseErrorMock | null;
};

function createMeetStreamAdminMock({
  eventInsertResult = { error: null },
  liveInputInsertResult = { data: createStreamRow(), error: null },
  liveInputLookups = [{ data: null, error: null }],
  liveInputUpdateResult = { data: createStreamRow(), error: null },
}: {
  eventInsertResult?: { error: SupabaseErrorMock | null };
  liveInputInsertResult?: QueryResult<MeetStreamLiveInput>;
  liveInputLookups?: QueryResult<MeetStreamLiveInput>[];
  liveInputUpdateResult?: QueryResult<MeetStreamLiveInput>;
} = {}) {
  const lookupResults = [...liveInputLookups];
  const liveInputsTable: Record<string, ReturnType<typeof vi.fn>> = {};
  const insertSingle = vi.fn(async () => liveInputInsertResult);
  const updateSingle = vi.fn(async () => liveInputUpdateResult);

  liveInputsTable.select = vi.fn(() => liveInputsTable);
  liveInputsTable.eq = vi.fn(() => liveInputsTable);
  liveInputsTable.maybeSingle = vi.fn(
    async () => lookupResults.shift() ?? { data: null, error: null }
  );
  liveInputsTable.insert = vi.fn(() => ({
    select: vi.fn(() => ({ single: insertSingle })),
  }));
  liveInputsTable.update = vi.fn(() => ({
    eq: vi.fn(() => ({
      select: vi.fn(() => ({ single: updateSingle })),
    })),
  }));

  const eventsTable = {
    insert: vi.fn(async () => eventInsertResult),
  };
  const from = vi.fn((table: string) =>
    table === 'meet_stream_live_inputs' ? liveInputsTable : eventsTable
  );
  const admin = {
    schema: vi.fn(() => ({ from })),
  } as unknown as TypedSupabaseClient;

  return { admin, eventsTable, insertSingle, liveInputsTable, updateSingle };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

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

describe('ensureMeetStreamLiveInput', () => {
  it('returns an existing enabled stream without requiring Cloudflare credentials', async () => {
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', '');
    vi.stubEnv('CLOUDFLARE_STREAM_API_TOKEN', '');
    vi.stubEnv('CLOUDFLARE_API_TOKEN', '');

    const existingStream = createStreamRow();
    const { admin, eventsTable, liveInputsTable } = createMeetStreamAdminMock({
      liveInputLookups: [{ data: existingStream, error: null }],
    });

    await expect(
      ensureMeetStreamLiveInput({
        actorId: 'user-1',
        admin,
        meetingId: 'meeting-1',
        meetingName: 'Weekly review',
        wsId: 'workspace-1',
      })
    ).resolves.toEqual({ created: false, stream: existingStream });

    expect(liveInputsTable.insert).not.toHaveBeenCalled();
    expect(eventsTable.insert).not.toHaveBeenCalled();
  });

  it('disables a racy duplicate Cloudflare input and returns the winning stream row', async () => {
    const winningStream = createStreamRow({
      cloudflare_live_input_uid: 'winner-live',
      id: 'winning-stream',
    });
    const { admin, eventsTable, liveInputsTable } = createMeetStreamAdminMock({
      liveInputInsertResult: {
        data: null,
        error: {
          code: '23505',
          details: 'Key (meeting_id)=(meeting-1) already exists.',
          message:
            'duplicate key value violates unique constraint "meet_stream_live_inputs_meeting_id_key"',
        },
      },
      liveInputLookups: [
        { data: null, error: null },
        { data: winningStream, error: null },
      ],
    });
    const cloudflare = {
      createLiveInput: vi.fn(async () => ({
        enabled: true,
        uid: 'orphan-live',
        webRTC: { url: 'https://customer.example/webRTC/publish/orphan' },
        webRTCPlayback: {
          url: 'https://customer.example/webRTC/play/orphan',
        },
      })),
      updateLiveInput: vi.fn(async () => ({
        enabled: false,
        uid: 'orphan-live',
      })),
    };

    await expect(
      ensureMeetStreamLiveInput({
        actorId: 'user-1',
        admin,
        cloudflare: cloudflare as unknown as CloudflareStreamClient,
        meetingId: 'meeting-1',
        meetingName: 'Weekly review',
        wsId: 'workspace-1',
      })
    ).resolves.toEqual({ created: false, stream: winningStream });

    expect(cloudflare.createLiveInput).toHaveBeenCalledTimes(1);
    expect(cloudflare.updateLiveInput).toHaveBeenCalledWith('orphan-live', {
      enabled: false,
    });
    expect(liveInputsTable.insert).toHaveBeenCalledTimes(1);
    expect(eventsTable.insert).not.toHaveBeenCalled();
  });

  it('disables a newly-created Cloudflare input when the DB insert fails', async () => {
    const { admin, eventsTable } = createMeetStreamAdminMock({
      liveInputInsertResult: {
        data: null,
        error: {
          code: 'PGRST500',
          message: 'database unavailable',
        },
      },
    });
    const cloudflare = {
      createLiveInput: vi.fn(async () => ({
        enabled: true,
        uid: 'failed-live',
        webRTC: { url: 'https://customer.example/webRTC/publish/failed' },
        webRTCPlayback: {
          url: 'https://customer.example/webRTC/play/failed',
        },
      })),
      updateLiveInput: vi.fn(async () => ({
        enabled: false,
        uid: 'failed-live',
      })),
    };

    await expect(
      ensureMeetStreamLiveInput({
        actorId: 'user-1',
        admin,
        cloudflare: cloudflare as unknown as CloudflareStreamClient,
        meetingId: 'meeting-1',
        meetingName: 'Weekly review',
        wsId: 'workspace-1',
      })
    ).rejects.toThrow('meet_stream_insert_failed:database unavailable');

    expect(cloudflare.updateLiveInput).toHaveBeenCalledWith('failed-live', {
      enabled: false,
    });
    expect(eventsTable.insert).not.toHaveBeenCalled();
  });

  it('disables a newly-created Cloudflare input when Stream omits WebRTC URLs', async () => {
    const { admin, liveInputsTable } = createMeetStreamAdminMock();
    const cloudflare = {
      createLiveInput: vi.fn(async () => ({
        enabled: true,
        uid: 'broken-live',
      })),
      updateLiveInput: vi.fn(async () => ({
        enabled: false,
        uid: 'broken-live',
      })),
    };

    await expect(
      ensureMeetStreamLiveInput({
        actorId: 'user-1',
        admin,
        cloudflare: cloudflare as unknown as CloudflareStreamClient,
        meetingId: 'meeting-1',
        meetingName: 'Weekly review',
        wsId: 'workspace-1',
      })
    ).rejects.toThrow('cloudflare_stream_webrtc_urls_missing');

    expect(cloudflare.updateLiveInput).toHaveBeenCalledWith('broken-live', {
      enabled: false,
    });
    expect(liveInputsTable.insert).not.toHaveBeenCalled();
  });
});

describe('serializeMeetStreamLiveInput', () => {
  const stream = createStreamRow();

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
