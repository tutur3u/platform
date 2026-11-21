import { z } from 'zod';
import { getInternalApiClient, type InternalApiClientOptions } from './client';

// Contracts for the Mira cloud channels tenant API
// (apps/docs/platform/ai/mira-cloud-channels.mdx#api-contract). Money is
// integer micro-USD. Routes validate bodies with these schemas and parse RPC
// output with them before responding.

export const MIRA_CHANNEL_KINDS = ['discord', 'whatsapp', 'zalo'] as const;
export const MIRA_CONNECTION_MODES = [
  'shared_bot',
  'bot',
  'official',
  'personal',
] as const;
export const MIRA_CHANNEL_STATUSES = [
  'draft',
  'connected',
  'live',
  'error',
] as const;
export const MIRA_STOP_REASONS = [
  'tenant',
  'operator',
  'billing',
  'cap',
] as const;
export const MIRA_KEY_MODES = ['managed', 'byok'] as const;
export const MIRA_PRESETS = ['fast', 'quality'] as const;
/** Failures a connect attempt can report; never provider text. */
export const MIRA_CONNECT_ERRORS = [
  'invalid_proof',
  'expired_state',
  'already_bound',
] as const;
/** The longest usage range one request may read. */
export const MIRA_USAGE_MAX_DAYS = 400;
export const MIRA_OPERATOR_NOTE_MAX_LENGTH = 500;

export type MiraChannelKind = (typeof MIRA_CHANNEL_KINDS)[number];
export type MiraStopReason = (typeof MIRA_STOP_REASONS)[number];
export type MiraConnectError = (typeof MIRA_CONNECT_ERRORS)[number];

const microUsd = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const generation = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const minuteOfDay = z.number().int().min(0).max(1439);
const isoTimestamp = z.string().min(1);
const isoDate = z.iso.date();

export const miraModelIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9._/-]{0,127}$/u);

export const miraQuietHoursSchema = z
  .object({
    startMinute: minuteOfDay,
    endMinute: minuteOfDay,
    timeZone: z
      .string()
      .regex(/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/u)
      .max(64),
  })
  .strict();

export const miraStopReasonsSchema = z.array(z.enum(MIRA_STOP_REASONS));

export const miraChannelSchema = z.object({
  id: z.guid(),
  kind: z.enum(MIRA_CHANNEL_KINDS),
  connectionMode: z.enum(MIRA_CONNECTION_MODES),
  displayName: z.string(),
  status: z.enum(MIRA_CHANNEL_STATUSES),
  stopReasons: miraStopReasonsSchema,
  stopGeneration: generation,
  sendOwner: z.enum(['m4', 'cloud']),
  ownerGeneration: generation,
  lastErrorCode: z.string().nullable(),
  lastErrorAt: isoTimestamp.nullable(),
  lastEventAt: isoTimestamp.nullable(),
  secrets: z.array(z.object({ name: z.string(), connectedAt: isoTimestamp })),
});

export const miraTenantSchema = z.object({
  wsId: z.guid(),
  enabled: z.boolean(),
  keyMode: z.enum(MIRA_KEY_MODES),
  preset: z.enum(MIRA_PRESETS),
  modelId: miraModelIdSchema.nullable(),
  neverSilent: z.boolean(),
  quietHours: miraQuietHoursSchema.nullable(),
  dailyCapMicroUsd: microUsd,
  monthlyCapMicroUsd: microUsd,
  stopReasons: miraStopReasonsSchema,
  stopGeneration: generation,
  configVersion: generation,
  persona: z.object({ name: z.string(), instructions: z.string() }).nullable(),
  channels: z.array(miraChannelSchema),
});

export type MiraChannel = z.infer<typeof miraChannelSchema>;
export type MiraTenant = z.infer<typeof miraTenantSchema>;

export interface MiraTenantResponse {
  /** Null until the first settings save creates the tenant. */
  tenant: MiraTenant | null;
  canManage: boolean;
}

export const miraSettingsPatchSchema = z
  .object({
    /** Null only for the first save, which creates the tenant. */
    expectedConfigVersion: generation.nullable(),
    settings: z
      .object({
        enabled: z.boolean(),
        keyMode: z.enum(MIRA_KEY_MODES),
        preset: z.enum(MIRA_PRESETS),
        modelId: miraModelIdSchema.nullable(),
        neverSilent: z.boolean(),
        quietHours: miraQuietHoursSchema.nullable(),
        dailyCapMicroUsd: microUsd,
        monthlyCapMicroUsd: microUsd,
      })
      .partial()
      .strict(),
  })
  .strict();

export type MiraSettingsPatch = z.infer<typeof miraSettingsPatchSchema>;

export interface MiraSettingsResponse {
  configVersion: number;
}

/** Tenant kill switch; the reason is always `tenant`. */
export const miraTenantStopSchema = z
  .object({
    channelId: z.guid().optional(),
    stopped: z.boolean(),
    expectedGeneration: generation,
  })
  .strict();

export type MiraTenantStopRequest = z.infer<typeof miraTenantStopSchema>;

export const miraStopResultSchema = z.object({
  stopReasons: miraStopReasonsSchema,
  stopGeneration: generation,
});

export type MiraStopResult = z.infer<typeof miraStopResultSchema>;

const proofToken = z.string().min(1).max(4096);

/**
 * Provider proof per channel kind. Personal-account modes are host-side only
 * and never connect through the cloud.
 */
export const miraConnectSchemas = {
  discord: z.discriminatedUnion('mode', [
    z
      .object({
        mode: z.literal('shared_bot'),
        code: proofToken,
        state: proofToken,
        guildId: z.string().regex(/^\d{1,32}$/u),
      })
      .strict(),
    z.object({ mode: z.literal('bot'), token: proofToken }).strict(),
  ]),
  whatsapp: z.discriminatedUnion('mode', [
    z
      .object({
        mode: z.literal('official'),
        code: proofToken,
        phoneNumberId: z.string().regex(/^\d{1,32}$/u),
        businessAccountId: z.string().regex(/^\d{1,32}$/u),
      })
      .strict(),
  ]),
  zalo: z.discriminatedUnion('mode', [
    z
      .object({
        mode: z.literal('official'),
        code: proofToken,
        state: proofToken,
      })
      .strict(),
    z.object({ mode: z.literal('bot'), token: proofToken }).strict(),
  ]),
} as const;

export type MiraConnectProof<K extends MiraChannelKind = MiraChannelKind> =
  z.infer<(typeof miraConnectSchemas)[K]>;

export interface MiraConnectResponse {
  channelId: string;
}

export interface MiraUnbindResponse {
  unbound: boolean;
}

export const miraUsageRowSchema = z.object({
  channelId: z.guid(),
  modelId: z.string(),
  day: isoDate,
  replies: microUsd,
  weightedReplies: microUsd,
  triaged: microUsd,
  inputTokens: microUsd,
  cachedInputTokens: microUsd,
  outputTokens: microUsd,
  costMicroUsd: microUsd,
});

export type MiraUsageRow = z.infer<typeof miraUsageRowSchema>;

export interface MiraUsageResponse {
  from: string;
  to: string;
  rows: MiraUsageRow[];
}

export const miraUsageQuerySchema = z
  .object({ from: isoDate, to: isoDate })
  .refine(
    ({ from, to }) => {
      const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
      return days >= 0 && days <= MIRA_USAGE_MAX_DAYS;
    },
    { message: 'invalid_range' }
  );

function miraPath(wsId: string, suffix = '') {
  return `/api/v1/workspaces/${encodeURIComponent(wsId)}/mira${suffix}`;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function getMiraTenant(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<MiraTenantResponse>(
    miraPath(wsId),
    { cache: 'no-store' }
  );
}

export function updateMiraSettings(
  wsId: string,
  payload: MiraSettingsPatch,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<MiraSettingsResponse>(
    miraPath(wsId, '/settings'),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: JSON_HEADERS,
      method: 'PATCH',
    }
  );
}

export function setMiraTenantStop(
  wsId: string,
  payload: MiraTenantStopRequest,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<MiraStopResult>(
    miraPath(wsId, '/stop'),
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: JSON_HEADERS,
      method: 'POST',
    }
  );
}

export function connectMiraChannel<K extends MiraChannelKind>(
  wsId: string,
  kind: K,
  proof: MiraConnectProof<K>,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<MiraConnectResponse>(
    miraPath(wsId, `/channels/${encodeURIComponent(kind)}/connect`),
    {
      body: JSON.stringify(proof),
      cache: 'no-store',
      headers: JSON_HEADERS,
      method: 'POST',
    }
  );
}

export function unbindMiraChannel(
  wsId: string,
  channelId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<MiraUnbindResponse>(
    miraPath(wsId, `/channels/${encodeURIComponent(channelId)}`),
    { cache: 'no-store', method: 'DELETE' }
  );
}

export function getMiraUsage(
  wsId: string,
  range: { from: string; to: string },
  options?: InternalApiClientOptions
) {
  const query = new URLSearchParams(range);
  return getInternalApiClient(options).json<MiraUsageResponse>(
    miraPath(wsId, `/usage?${query.toString()}`),
    { cache: 'no-store' }
  );
}
