import {
  MIRA_OPERATOR_PAGE_MAX,
  type MiraOperatorMetrics,
  miraGlobalStopRequestSchema,
  miraOperatorStopSchema,
} from '@tuturuuu/internal-api/infrastructure/mira';
import {
  getMiraGlobalStopRecord,
  listMiraAuditRecords,
  listMiraOperatorOverview,
  MiraRpcError,
  type MiraRpcClient,
  readBackMiraStop,
  setMiraGlobalStopRecord,
  setMiraStopReason,
} from '@tuturuuu/internal-api/mira-channels-rpc';
import { z } from 'zod';

// Cross-tenant Mira operator operations behind the Admin routes. The route
// adapter authorizes the operator and injects the service-role RPC client.
// Reads return metadata only; no message content is reachable from here.

export type MiraOperatorAction =
  | 'tenants'
  | 'tenant_stop'
  | 'global_stop_get'
  | 'global_stop_set'
  | 'audit';

export interface MiraOperatorDeps {
  rpc: MiraRpcClient;
  /** Seven-day error counts and p95 first-token latency per workspace. */
  loadMetrics: (wsIds: string[]) => Promise<MiraOperatorMetrics>;
}

export interface MiraOperatorRequest {
  action: MiraOperatorAction;
  actorId: string;
  body?: unknown;
  wsId?: string;
  searchParams?: URLSearchParams;
}

export type MiraOperatorResult = { status: number; body: unknown };

const fail = (error: string, status: number): MiraOperatorResult => ({
  status,
  body: { error },
});

const pageLimit = z.coerce
  .number()
  .int()
  .min(1)
  .max(MIRA_OPERATOR_PAGE_MAX)
  .default(50);

export async function runMiraOperatorAction(
  deps: MiraOperatorDeps,
  request: MiraOperatorRequest
): Promise<MiraOperatorResult> {
  const params = request.searchParams ?? new URLSearchParams();
  try {
    switch (request.action) {
      case 'tenants': {
        const query = z
          .object({ after: z.guid().optional(), limit: pageLimit })
          .safeParse({
            after: params.get('after') ?? undefined,
            limit: params.get('limit') ?? undefined,
          });
        if (!query.success) return fail('invalid_request', 400);
        const tenants = await listMiraOperatorOverview(deps.rpc, {
          after: query.data.after ?? null,
          limit: query.data.limit,
        });
        const metrics = await deps
          .loadMetrics(tenants.map((tenant) => tenant.wsId))
          .catch((): MiraOperatorMetrics => ({ status: 'unavailable' }));
        return {
          status: 200,
          body: {
            tenants,
            metrics,
            nextAfter:
              tenants.length === query.data.limit
                ? (tenants.at(-1)?.wsId ?? null)
                : null,
          },
        };
      }
      case 'tenant_stop': {
        const wsId = z.guid().safeParse(request.wsId);
        const parsed = miraOperatorStopSchema.safeParse(request.body);
        if (!wsId.success || !parsed.success) {
          return fail('invalid_request', 400);
        }
        const channelId = parsed.data.channelId ?? null;
        const written = await setMiraStopReason(deps.rpc, {
          wsId: wsId.data,
          channelId,
          reason: 'operator',
          stopped: parsed.data.stopped,
          actorId: request.actorId,
          expectedGeneration: parsed.data.expectedGeneration,
          note: parsed.data.note,
        });
        return {
          status: 200,
          body: await readBackMiraStop(deps.rpc, wsId.data, channelId, written),
        };
      }
      case 'global_stop_get':
        return { status: 200, body: await getMiraGlobalStopRecord(deps.rpc) };
      case 'global_stop_set': {
        const parsed = miraGlobalStopRequestSchema.safeParse(request.body);
        if (!parsed.success) return fail('invalid_request', 400);
        const written = await setMiraGlobalStopRecord(deps.rpc, {
          ...parsed.data,
          actorId: request.actorId,
        });
        const readBack = await getMiraGlobalStopRecord(deps.rpc);
        if (readBack.generation < written.generation) {
          return fail('unavailable', 503);
        }
        return { status: 200, body: readBack };
      }
      case 'audit': {
        const query = z
          .object({
            wsId: z.guid().optional(),
            before: z.coerce.number().int().positive().optional(),
            limit: pageLimit,
          })
          .safeParse({
            wsId: params.get('wsId') ?? undefined,
            before: params.get('before') ?? undefined,
            limit: params.get('limit') ?? undefined,
          });
        if (!query.success) return fail('invalid_request', 400);
        const events = await listMiraAuditRecords(deps.rpc, {
          wsId: query.data.wsId ?? null,
          before: query.data.before ?? null,
          limit: query.data.limit,
        });
        return {
          status: 200,
          body: {
            events,
            nextBefore:
              events.length === query.data.limit
                ? (events.at(-1)?.id ?? null)
                : null,
          },
        };
      }
    }
  } catch (error) {
    if (error instanceof MiraRpcError) {
      const { code, status } = error as MiraRpcError;
      return fail(code, status);
    }
    console.error('mira-channels: operator request failed', {
      action: request.action,
    });
    return fail('unavailable', 503);
  }
}
