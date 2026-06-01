import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { MeetStreamEvent, MeetStreamLiveInput } from '@tuturuuu/types/db';
import { z } from 'zod';

const DEFAULT_CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';
const STREAM_RECORDING_MODE = 'off';

const cloudflareLiveInputSchema = z
  .object({
    enabled: z.boolean().optional(),
    uid: z.string().min(1),
    webRTC: z
      .object({
        url: z.string().min(1),
      })
      .optional(),
    webRTCPlayback: z
      .object({
        url: z.string().min(1),
      })
      .optional(),
  })
  .passthrough();

const cloudflareApiEnvelopeSchema = z
  .object({
    errors: z
      .array(
        z
          .object({
            code: z.union([z.number(), z.string()]).optional(),
            message: z.string().optional(),
          })
          .passthrough()
      )
      .optional(),
    result: cloudflareLiveInputSchema.optional(),
    success: z.boolean().optional(),
  })
  .passthrough();

export type CloudflareStreamLiveInput = z.infer<
  typeof cloudflareLiveInputSchema
>;

export type CloudflareStreamClientOptions = {
  accountId?: string;
  apiBaseUrl?: string;
  apiToken?: string;
  fetch?: typeof fetch;
};

export type CreateCloudflareStreamLiveInputInput = {
  allowedOrigins?: string[];
  actorId: string;
  meetingId: string;
  meetingName: string;
  wsId: string;
};

export type MeetStreamResponse = {
  createdAt: string;
  endedAt: string | null;
  id: string;
  liveInputUid: string;
  playbackUrl: string;
  publishUrl?: string;
  status: string;
  updatedAt: string;
};

type MeetStreamWriteError = {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  message: string;
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function getRequiredConfig(value: string | undefined, name: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} is required for Cloudflare Stream access`);
  }

  return trimmed;
}

export function getCloudflareStreamAllowedOrigins() {
  const origins = process.env.CLOUDFLARE_STREAM_ALLOWED_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins?.length ? origins : undefined;
}

export function createCloudflareStreamLiveInputBody({
  actorId,
  allowedOrigins,
  meetingId,
  meetingName,
  wsId,
}: CreateCloudflareStreamLiveInputInput) {
  return {
    enabled: true,
    meta: {
      createdBy: actorId,
      meetingId,
      name: `meet:${meetingName}`,
      product: 'tuturuuu-meet',
      wsId,
    },
    recording: {
      ...(allowedOrigins ? { allowedOrigins } : {}),
      hideLiveViewerCount: true,
      mode: STREAM_RECORDING_MODE,
      requireSignedURLs: false,
      timeoutSeconds: 0,
    },
  };
}

export class CloudflareStreamClient {
  private readonly accountId: string;
  private readonly apiBaseUrl: string;
  private readonly apiToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CloudflareStreamClientOptions = {}) {
    this.accountId = getRequiredConfig(
      options.accountId || process.env.CLOUDFLARE_ACCOUNT_ID,
      'CLOUDFLARE_ACCOUNT_ID'
    );
    this.apiBaseUrl = trimTrailingSlash(
      options.apiBaseUrl ||
        process.env.CLOUDFLARE_STREAM_API_BASE_URL ||
        DEFAULT_CLOUDFLARE_API_BASE_URL
    );
    this.apiToken = getRequiredConfig(
      options.apiToken ||
        process.env.CLOUDFLARE_STREAM_API_TOKEN ||
        process.env.CLOUDFLARE_API_TOKEN,
      'CLOUDFLARE_STREAM_API_TOKEN or CLOUDFLARE_API_TOKEN'
    );
    this.fetchImpl = options.fetch ?? fetch;
  }

  private async request(path: string, init: RequestInit) {
    const response = await this.fetchImpl(
      `${this.apiBaseUrl}/accounts/${encodeURIComponent(
        this.accountId
      )}${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
      }
    );

    const body = await response.text();
    const parsedJson = body ? JSON.parse(body) : {};

    if (!response.ok) {
      throw new Error(`cloudflare_stream_request_failed:${response.status}`);
    }

    const parsed = cloudflareApiEnvelopeSchema.safeParse(parsedJson);
    if (
      !parsed.success ||
      parsed.data.success === false ||
      !parsed.data.result
    ) {
      const message =
        parsed.success && parsed.data.errors?.[0]?.message
          ? parsed.data.errors[0].message
          : 'Unknown Cloudflare Stream response';
      throw new Error(`cloudflare_stream_api_failed:${message}`);
    }

    return parsed.data.result;
  }

  createLiveInput(input: CreateCloudflareStreamLiveInputInput) {
    return this.request('/stream/live_inputs', {
      body: JSON.stringify(
        createCloudflareStreamLiveInputBody({
          ...input,
          allowedOrigins:
            input.allowedOrigins ?? getCloudflareStreamAllowedOrigins(),
        })
      ),
      method: 'POST',
    });
  }

  updateLiveInput(
    liveInputUid: string,
    input: Partial<CreateCloudflareStreamLiveInputInput> & { enabled: boolean }
  ) {
    return this.request(
      `/stream/live_inputs/${encodeURIComponent(liveInputUid)}`,
      {
        body: JSON.stringify({
          enabled: input.enabled,
          ...(input.meetingId &&
          input.wsId &&
          input.actorId &&
          input.meetingName
            ? {
                meta: createCloudflareStreamLiveInputBody({
                  actorId: input.actorId,
                  allowedOrigins:
                    input.allowedOrigins ?? getCloudflareStreamAllowedOrigins(),
                  meetingId: input.meetingId,
                  meetingName: input.meetingName,
                  wsId: input.wsId,
                }).meta,
                recording: createCloudflareStreamLiveInputBody({
                  actorId: input.actorId,
                  allowedOrigins:
                    input.allowedOrigins ?? getCloudflareStreamAllowedOrigins(),
                  meetingId: input.meetingId,
                  meetingName: input.meetingName,
                  wsId: input.wsId,
                }).recording,
              }
            : {}),
        }),
        method: 'PUT',
      }
    );
  }
}

function requireStreamUrls(liveInput: CloudflareStreamLiveInput) {
  const whipUrl = liveInput.webRTC?.url;
  const whepUrl = liveInput.webRTCPlayback?.url;

  if (!whipUrl || !whepUrl) {
    throw new Error('cloudflare_stream_webrtc_urls_missing');
  }

  return { whepUrl, whipUrl };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isMeetStreamMeetingInsertConflict(error: MeetStreamWriteError) {
  if (error.code !== '23505') {
    return false;
  }

  const message = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(' ');

  return (
    message.includes('meeting_id') ||
    message.includes('meet_stream_live_inputs_meeting_id_key')
  );
}

async function disableCreatedCloudflareLiveInput({
  cloudflare,
  liveInputUid,
  reason,
}: {
  cloudflare: CloudflareStreamClient;
  liveInputUid: string;
  reason: string;
}) {
  try {
    await cloudflare.updateLiveInput(liveInputUid, { enabled: false });
  } catch (error) {
    throw new Error(`${reason}:${getErrorMessage(error)}`);
  }
}

export function serializeMeetStreamLiveInput(
  stream: MeetStreamLiveInput,
  options: { includePublishUrl?: boolean } = {}
): MeetStreamResponse {
  return {
    createdAt: stream.created_at,
    endedAt: stream.ended_at,
    id: stream.id,
    liveInputUid: stream.cloudflare_live_input_uid,
    playbackUrl: stream.whep_url,
    ...(options.includePublishUrl ? { publishUrl: stream.whip_url } : {}),
    status: stream.status,
    updatedAt: stream.updated_at,
  };
}

export async function createMeetStreamAdminClient() {
  return (await createAdminClient({ noCookie: true })) as TypedSupabaseClient;
}

export async function getMeetStreamLiveInput({
  admin,
  meetingId,
  wsId,
}: {
  admin: TypedSupabaseClient;
  meetingId: string;
  wsId: string;
}) {
  const { data, error } = await admin
    .schema('private')
    .from('meet_stream_live_inputs')
    .select('*')
    .eq('ws_id', wsId)
    .eq('meeting_id', meetingId)
    .maybeSingle();

  if (error) {
    throw new Error(`meet_stream_lookup_failed:${error.message}`);
  }

  return data;
}

export async function recordMeetStreamEvent({
  admin,
  event,
}: {
  admin: TypedSupabaseClient;
  event: Omit<MeetStreamEvent, 'created_at' | 'id'>;
}) {
  const { error } = await admin
    .schema('private')
    .from('meet_stream_events')
    .insert(event);

  if (error) {
    throw new Error(`meet_stream_event_insert_failed:${error.message}`);
  }
}

export async function ensureMeetStreamLiveInput({
  actorId,
  admin,
  cloudflare,
  meetingId,
  meetingName,
  wsId,
}: {
  actorId: string;
  admin: TypedSupabaseClient;
  cloudflare?: CloudflareStreamClient;
  meetingId: string;
  meetingName: string;
  wsId: string;
}) {
  const existing = await getMeetStreamLiveInput({ admin, meetingId, wsId });

  if (existing?.cloudflare_live_input_enabled && existing.status !== 'ended') {
    return { created: false, stream: existing };
  }

  const streamCloudflare = cloudflare ?? new CloudflareStreamClient();

  if (existing) {
    const liveInput = await streamCloudflare.updateLiveInput(
      existing.cloudflare_live_input_uid,
      {
        actorId,
        enabled: true,
        meetingId,
        meetingName,
        wsId,
      }
    );
    const urls =
      liveInput.webRTC?.url && liveInput.webRTCPlayback?.url
        ? requireStreamUrls(liveInput)
        : { whepUrl: existing.whep_url, whipUrl: existing.whip_url };

    const { data, error } = await admin
      .schema('private')
      .from('meet_stream_live_inputs')
      .update({
        cloudflare_live_input_enabled: true,
        ended_at: null,
        metadata: {
          cloudflareEnabled: liveInput.enabled ?? true,
          recordingMode: STREAM_RECORDING_MODE,
        },
        status: 'ready',
        whep_url: urls.whepUrl,
        whip_url: urls.whipUrl,
      })
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) {
      throw new Error(`meet_stream_resume_failed:${error.message}`);
    }

    await recordMeetStreamEvent({
      admin,
      event: {
        actor_id: actorId,
        event_type: 'stream_resumed',
        meeting_id: meetingId,
        metadata: {},
        stream_id: data.id,
        ws_id: wsId,
      },
    });

    return { created: false, stream: data };
  }

  const liveInput = await streamCloudflare.createLiveInput({
    actorId,
    meetingId,
    meetingName,
    wsId,
  });
  let urls: ReturnType<typeof requireStreamUrls>;

  try {
    urls = requireStreamUrls(liveInput);
  } catch (error) {
    await disableCreatedCloudflareLiveInput({
      cloudflare: streamCloudflare,
      liveInputUid: liveInput.uid,
      reason: 'meet_stream_url_cleanup_failed',
    });
    throw error;
  }

  const { data, error } = await admin
    .schema('private')
    .from('meet_stream_live_inputs')
    .insert({
      cloudflare_live_input_enabled: liveInput.enabled ?? true,
      cloudflare_live_input_uid: liveInput.uid,
      created_by: actorId,
      meeting_id: meetingId,
      metadata: {
        cloudflareEnabled: liveInput.enabled ?? true,
        recordingMode: STREAM_RECORDING_MODE,
      },
      status: 'ready',
      whep_url: urls.whepUrl,
      whip_url: urls.whipUrl,
      ws_id: wsId,
    })
    .select('*')
    .single();

  if (error) {
    const isMeetingConflict = isMeetStreamMeetingInsertConflict(error);

    await disableCreatedCloudflareLiveInput({
      cloudflare: streamCloudflare,
      liveInputUid: liveInput.uid,
      reason: isMeetingConflict
        ? 'meet_stream_insert_conflict_cleanup_failed'
        : 'meet_stream_insert_cleanup_failed',
    });

    if (isMeetingConflict) {
      const winner = await getMeetStreamLiveInput({ admin, meetingId, wsId });

      if (winner?.cloudflare_live_input_enabled && winner.status !== 'ended') {
        return { created: false, stream: winner };
      }

      if (winner) {
        return ensureMeetStreamLiveInput({
          actorId,
          admin,
          cloudflare: streamCloudflare,
          meetingId,
          meetingName,
          wsId,
        });
      }
    }

    throw new Error(`meet_stream_insert_failed:${error.message}`);
  }

  await recordMeetStreamEvent({
    admin,
    event: {
      actor_id: actorId,
      event_type: 'stream_created',
      meeting_id: meetingId,
      metadata: {
        cloudflareLiveInputUid: liveInput.uid,
      },
      stream_id: data.id,
      ws_id: wsId,
    },
  });

  return { created: true, stream: data };
}

export async function stopMeetStreamLiveInput({
  actorId,
  admin,
  cloudflare,
  meetingId,
  wsId,
}: {
  actorId: string;
  admin: TypedSupabaseClient;
  cloudflare?: CloudflareStreamClient;
  meetingId: string;
  wsId: string;
}) {
  const existing = await getMeetStreamLiveInput({ admin, meetingId, wsId });

  if (!existing) {
    return null;
  }

  const streamCloudflare = cloudflare ?? new CloudflareStreamClient();

  await streamCloudflare.updateLiveInput(existing.cloudflare_live_input_uid, {
    enabled: false,
  });

  const { data, error } = await admin
    .schema('private')
    .from('meet_stream_live_inputs')
    .update({
      cloudflare_live_input_enabled: false,
      ended_at: new Date().toISOString(),
      status: 'ended',
    })
    .eq('id', existing.id)
    .select('*')
    .single();

  if (error) {
    throw new Error(`meet_stream_stop_failed:${error.message}`);
  }

  await recordMeetStreamEvent({
    admin,
    event: {
      actor_id: actorId,
      event_type: 'stream_stopped',
      meeting_id: meetingId,
      metadata: {},
      stream_id: data.id,
      ws_id: wsId,
    },
  });

  return data;
}
