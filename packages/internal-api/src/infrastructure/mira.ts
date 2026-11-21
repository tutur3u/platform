import { z } from 'zod';
import { getInternalApiClient, type InternalApiClientOptions } from '../client';
import {
  MIRA_OPERATOR_NOTE_MAX_LENGTH,
  type MiraStopResult,
  miraStopReasonsSchema,
} from '../mira-channels';

// Contracts for the cross-tenant Mira operator API served by the Admin app
// (apps/docs/platform/ai/mira-cloud-channels.mdx#api-contract). Paths are
// app-relative: the registered Admin app-base resolver adds the mount, so the
// client never names a host or the Admin base path. Money is micro-USD.

export const MIRA_OPERATOR_PAGE_MAX = 100;

const generation = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const operatorNote = z
  .string()
  .trim()
  .min(1)
  .max(MIRA_OPERATOR_NOTE_MAX_LENGTH);

export const miraOperatorStopSchema = z
  .object({
    channelId: z.guid().optional(),
    stopped: z.boolean(),
    expectedGeneration: generation,
    note: operatorNote,
  })
  .strict();

export const miraGlobalStopRequestSchema = z
  .object({
    stopped: z.boolean(),
    expectedGeneration: generation,
    note: operatorNote,
  })
  .strict();

export const miraGlobalStopSchema = z.object({
  stopped: z.boolean(),
  generation,
  updatedAt: z.string(),
  updatedBy: z.guid().nullable(),
});

export const miraOperatorTenantRowSchema = z.object({
  wsId: z.guid(),
  enabled: z.boolean(),
  stopReasons: miraStopReasonsSchema,
  channelCount: count,
  stoppedChannelCount: count,
  lastErrorAt: z.string().nullable(),
  costMicroUsd7d: count,
  replies7d: count,
});

export const miraAuditRowSchema = z.object({
  id: count,
  wsId: z.guid(),
  channelId: z.guid().nullable(),
  actorKind: z.enum(['tenant_manager', 'operator', 'billing', 'system']),
  actorId: z.guid().nullable(),
  action: z.string(),
  reasonCode: z.string(),
  oldGeneration: generation.nullable(),
  newGeneration: generation.nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});

export type MiraOperatorStopRequest = z.infer<typeof miraOperatorStopSchema>;
export type MiraGlobalStopRequest = z.infer<typeof miraGlobalStopRequestSchema>;
export type MiraGlobalStop = z.infer<typeof miraGlobalStopSchema>;
export type MiraOperatorTenantRow = z.infer<typeof miraOperatorTenantRowSchema>;
export type MiraAuditRow = z.infer<typeof miraAuditRowSchema>;

/** Runtime metrics come from Analytics Engine once the channel Worker emits them. */
export type MiraOperatorMetrics =
  | {
      status: 'ok';
      byWorkspace: Record<
        string,
        { errorCount7d: number; p95FirstTokenMs: number | null }
      >;
    }
  | { status: 'unavailable' };

export interface MiraOperatorTenantsResponse {
  tenants: MiraOperatorTenantRow[];
  metrics: MiraOperatorMetrics;
  nextAfter: string | null;
}

export interface MiraAuditResponse {
  events: MiraAuditRow[];
  nextBefore: number | null;
}

const BASE = '/api/v1/infrastructure/mira';
// Writes carry the operator action header the Admin routes require as
// same-origin intent alongside Origin and Sec-Fetch-Site.
const WRITE_HEADERS = {
  'Content-Type': 'application/json',
  'x-tuturuuu-mira-operator-action': '1',
};

function withQuery(path: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, value);
  }
  return query.size > 0 ? `${path}?${query.toString()}` : path;
}

export function listMiraOperatorTenants(
  params: { after?: string; limit?: number } = {},
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<MiraOperatorTenantsResponse>(
    withQuery(`${BASE}/tenants`, {
      after: params.after,
      limit: params.limit?.toString(),
    }),
    { cache: 'no-store' }
  );
}

export function setMiraOperatorStop(
  wsId: string,
  payload: MiraOperatorStopRequest,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<MiraStopResult>(
    `${BASE}/tenants/${encodeURIComponent(wsId)}/stop`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: WRITE_HEADERS,
      method: 'POST',
    }
  );
}

export function getMiraGlobalStop(options?: InternalApiClientOptions) {
  return getInternalApiClient(options).json<MiraGlobalStop>(
    `${BASE}/global-stop`,
    { cache: 'no-store' }
  );
}

export function setMiraGlobalStop(
  payload: MiraGlobalStopRequest,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<MiraGlobalStop>(
    `${BASE}/global-stop`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: WRITE_HEADERS,
      method: 'POST',
    }
  );
}

export function listMiraAuditEvents(
  params: { wsId?: string; before?: number; limit?: number } = {},
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<MiraAuditResponse>(
    withQuery(`${BASE}/audit`, {
      wsId: params.wsId,
      before: params.before?.toString(),
      limit: params.limit?.toString(),
    }),
    { cache: 'no-store' }
  );
}
