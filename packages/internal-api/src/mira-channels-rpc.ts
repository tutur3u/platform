import { z } from 'zod';
import {
  type MiraAuditRow,
  type MiraGlobalStop,
  type MiraOperatorTenantRow,
  miraAuditRowSchema,
  miraGlobalStopSchema,
  miraOperatorTenantRowSchema,
} from './infrastructure/mira';
import {
  type MiraChannelKind,
  type MiraSettingsPatch,
  type MiraStopResult,
  type MiraTenant,
  type MiraUsageRow,
  miraStopResultSchema,
  miraTenantSchema,
  miraUsageRowSchema,
} from './mira-channels';

// Server-side access to the private.mira_* RPCs for the tenant routes in Web
// and the operator routes in Admin. Framework-free: callers inject a
// service-role client. Every RPC result is parsed before it leaves here, and
// failures surface only as MiraRpcError codes, never database text.

type RpcResult = PromiseLike<{
  data: unknown;
  error: { code?: string | null } | null;
}>;

export interface MiraRpcClient {
  schema(schema: 'private'): {
    rpc(fn: string, args?: Record<string, unknown>): RpcResult;
  };
}

export type MiraRpcErrorCode =
  | 'conflict'
  | 'forbidden'
  | 'not_found'
  | 'already_bound'
  | 'invalid_request'
  | 'unavailable';

const STATUS: Record<MiraRpcErrorCode, number> = {
  conflict: 409,
  forbidden: 403,
  not_found: 404,
  already_bound: 409,
  invalid_request: 400,
  unavailable: 503,
};

export class MiraRpcError extends Error {
  readonly status: number;
  constructor(readonly code: MiraRpcErrorCode) {
    super(code);
    this.name = 'MiraRpcError';
    this.status = STATUS[code];
  }
}

/** SQLSTATE to API error, per the contract's mapping table. */
export function miraErrorFromSqlState(
  sqlState: string | null | undefined
): MiraRpcError {
  switch (sqlState) {
    case '40001':
      return new MiraRpcError('conflict');
    case '42501':
      return new MiraRpcError('forbidden');
    case 'P0002':
      return new MiraRpcError('not_found');
    case '23505':
      return new MiraRpcError('already_bound');
    case '22023':
    case '22P02':
    case '23514':
      return new MiraRpcError('invalid_request');
    default:
      return new MiraRpcError('unavailable');
  }
}

async function call(
  client: MiraRpcClient,
  fn: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const { data, error } = await client.schema('private').rpc(fn, args);
  if (error) {
    const mapped = miraErrorFromSqlState(error.code);
    if (mapped.code === 'unavailable') {
      console.error('mira-channels: rpc failed', { fn, code: error.code });
    }
    throw mapped;
  }
  return data;
}

function parse<T>(schema: z.ZodType<T>, value: unknown, fn: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    console.error('mira-channels: unexpected rpc shape', { fn });
    throw new MiraRpcError('unavailable');
  }
  return parsed.data;
}

const numeric = z
  .union([z.number(), z.string().regex(/^\d+$/u)])
  .transform(Number);

export async function getMiraTenantRecord(
  client: MiraRpcClient,
  wsId: string
): Promise<MiraTenant | null> {
  const data = await call(client, 'mira_get_tenant', { p_ws_id: wsId });
  return data == null ? null : parse(miraTenantSchema, data, 'mira_get_tenant');
}

export async function updateMiraTenantSettings(
  client: MiraRpcClient,
  input: { wsId: string; actorId: string } & MiraSettingsPatch
): Promise<{ configVersion: number }> {
  const data = await call(client, 'mira_update_tenant_settings', {
    p_ws_id: input.wsId,
    p_actor_id: input.actorId,
    p_authority: 'tenant_manager',
    p_expected_config_version: input.expectedConfigVersion,
    p_settings: input.settings,
  });
  return parse(
    z.object({ configVersion: z.number().int().positive() }),
    data,
    'mira_update_tenant_settings'
  );
}

export async function setMiraStopReason(
  client: MiraRpcClient,
  input: {
    wsId: string;
    channelId: string | null;
    reason: 'tenant' | 'operator';
    stopped: boolean;
    actorId: string;
    expectedGeneration: number;
    note: string | null;
  }
): Promise<MiraStopResult> {
  const data = await call(client, 'mira_set_stop_reason', {
    p_ws_id: input.wsId,
    p_channel_id: input.channelId,
    p_reason: input.reason,
    p_stopped: input.stopped,
    p_authority: input.reason === 'tenant' ? 'tenant_manager' : 'operator',
    p_actor_id: input.actorId,
    p_expected_generation: input.expectedGeneration,
    p_note: input.note,
  });
  return parse(miraStopResultSchema, data, 'mira_set_stop_reason');
}

/**
 * Reads the stop state back after a write, so a response reports only what
 * the database holds. A missing row or a generation older than the write
 * means the change did not persist.
 */
export async function readBackMiraStop(
  client: MiraRpcClient,
  wsId: string,
  channelId: string | null,
  written: MiraStopResult
): Promise<MiraStopResult> {
  const tenant = await getMiraTenantRecord(client, wsId);
  const source = channelId
    ? tenant?.channels.find((channel) => channel.id === channelId)
    : tenant;
  if (!source || source.stopGeneration < written.stopGeneration) {
    throw new MiraRpcError('unavailable');
  }
  return {
    stopReasons: source.stopReasons,
    stopGeneration: source.stopGeneration,
  };
}

export async function bindMiraChannel(
  client: MiraRpcClient,
  input: {
    wsId: string;
    actorId: string;
    kind: MiraChannelKind;
    mode: 'shared_bot' | 'bot' | 'official';
    providerAccountId: string;
    displayName: string;
  }
): Promise<string> {
  const data = await call(client, 'mira_bind_channel', {
    p_ws_id: input.wsId,
    p_actor_id: input.actorId,
    p_kind: input.kind,
    p_mode: input.mode,
    p_provider_account_id: input.providerAccountId,
    p_display_name: input.displayName,
  });
  return parse(z.guid(), data, 'mira_bind_channel');
}

export async function unbindMiraChannelRecord(
  client: MiraRpcClient,
  input: { wsId: string; channelId: string; actorId: string }
): Promise<boolean> {
  const data = await call(client, 'mira_unbind_channel', {
    p_ws_id: input.wsId,
    p_channel_id: input.channelId,
    p_actor_id: input.actorId,
  });
  return parse(z.boolean(), data, 'mira_unbind_channel');
}

const usageRowFromDb = z
  .object({
    channel_id: z.string(),
    model_id: z.string(),
    day: z.string(),
    replies: numeric,
    weighted_replies: numeric,
    triaged: numeric,
    input_tokens: numeric,
    cached_input_tokens: numeric,
    output_tokens: numeric,
    cost_micro_usd: numeric,
  })
  .transform((row) => ({
    channelId: row.channel_id,
    modelId: row.model_id,
    day: row.day,
    replies: row.replies,
    weightedReplies: row.weighted_replies,
    triaged: row.triaged,
    inputTokens: row.input_tokens,
    cachedInputTokens: row.cached_input_tokens,
    outputTokens: row.output_tokens,
    costMicroUsd: row.cost_micro_usd,
  }))
  .pipe(miraUsageRowSchema);

export async function listMiraUsage(
  client: MiraRpcClient,
  input: { wsId: string; from: string; to: string }
): Promise<MiraUsageRow[]> {
  const data = await call(client, 'mira_list_usage', {
    p_ws_id: input.wsId,
    p_from: input.from,
    p_to: input.to,
  });
  return parse(z.array(usageRowFromDb), data ?? [], 'mira_list_usage');
}

export async function getMiraGlobalStopRecord(
  client: MiraRpcClient
): Promise<MiraGlobalStop> {
  const data = await call(client, 'mira_get_global_stop', {});
  return parse(miraGlobalStopSchema, data, 'mira_get_global_stop');
}

export async function setMiraGlobalStopRecord(
  client: MiraRpcClient,
  input: {
    stopped: boolean;
    expectedGeneration: number;
    actorId: string;
    note: string;
  }
): Promise<MiraGlobalStop> {
  const data = await call(client, 'mira_set_global_stop', {
    p_stopped: input.stopped,
    p_expected_generation: input.expectedGeneration,
    p_actor_id: input.actorId,
    p_note: input.note,
  });
  return parse(miraGlobalStopSchema, data, 'mira_set_global_stop');
}

const overviewRowFromDb = z
  .object({
    ws_id: z.string(),
    enabled: z.boolean(),
    stop_reasons: z.array(z.string()),
    channel_count: numeric,
    stopped_channel_count: numeric,
    last_error_at: z.string().nullable(),
    cost_micro_usd_7d: numeric,
    replies_7d: numeric,
  })
  .transform((row) => ({
    wsId: row.ws_id,
    enabled: row.enabled,
    stopReasons: row.stop_reasons,
    channelCount: row.channel_count,
    stoppedChannelCount: row.stopped_channel_count,
    lastErrorAt: row.last_error_at,
    costMicroUsd7d: row.cost_micro_usd_7d,
    replies7d: row.replies_7d,
  }))
  .pipe(miraOperatorTenantRowSchema);

export async function listMiraOperatorOverview(
  client: MiraRpcClient,
  input: { after: string | null; limit: number }
): Promise<MiraOperatorTenantRow[]> {
  const data = await call(client, 'mira_operator_overview', {
    p_after: input.after,
    p_limit: input.limit,
  });
  return parse(
    z.array(overviewRowFromDb),
    data ?? [],
    'mira_operator_overview'
  );
}

const auditRowFromDb = z
  .object({
    id: numeric,
    ws_id: z.string(),
    channel_id: z.string().nullable(),
    actor_kind: z.string(),
    actor_id: z.string().nullable(),
    action: z.string(),
    reason_code: z.string(),
    old_generation: numeric.nullable(),
    new_generation: numeric.nullable(),
    note: z.string().nullable(),
    created_at: z.string(),
  })
  .transform((row) => ({
    id: row.id,
    wsId: row.ws_id,
    channelId: row.channel_id,
    actorKind: row.actor_kind,
    actorId: row.actor_id,
    action: row.action,
    reasonCode: row.reason_code,
    oldGeneration: row.old_generation,
    newGeneration: row.new_generation,
    note: row.note,
    createdAt: row.created_at,
  }))
  .pipe(miraAuditRowSchema);

export async function listMiraAuditRecords(
  client: MiraRpcClient,
  input: { wsId: string | null; before: number | null; limit: number }
): Promise<MiraAuditRow[]> {
  const data = await call(client, 'mira_list_audit_events', {
    p_ws_id: input.wsId,
    p_before: input.before,
    p_limit: input.limit,
  });
  return parse(z.array(auditRowFromDb), data ?? [], 'mira_list_audit_events');
}
