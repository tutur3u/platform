import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Json } from '@tuturuuu/types';
import { z } from 'zod';
import { AppealError, storedAppealReasonSchema } from './domain';
import type { AppealStore } from './service';

type AppealRpcSchema = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
    Functions: {
      email_appeal_list: {
        Args: {
          p_ws_id: string;
          p_actor_id: string;
          p_search: string;
          p_offset: number;
          p_limit: number;
        };
        Returns: Json;
      };
      email_appeal_request: {
        Args: {
          p_ws_id: string;
          p_actor_id: string;
          p_email: string;
          p_reason: string;
          p_token_hash: string;
        };
        Returns: Json;
      };
      email_appeal_claim_delivery: { Args: { p_id: string }; Returns: Json };
      email_appeal_mark_delivery: {
        Args: { p_id: string; p_outcome: string };
        Returns: Json;
      };
      email_appeal_confirm: { Args: { p_token_hash: string }; Returns: Json };
    };
  };
};

function storeError(error: { message: string; code?: string }): AppealError {
  if (/rate_limit|workspace_limit|address_limit/i.test(error.message))
    return new AppealError('rate_limited');
  if (/cooldown|pending/i.test(error.message))
    return new AppealError('cooldown');
  if (/not_appealable|not_blocked/i.test(error.message))
    return new AppealError('not_appealable');
  if (error.code === '42501') return new AppealError('forbidden');
  return new AppealError('store_unavailable');
}

export async function createAppealStore(
  actorId?: string
): Promise<AppealStore> {
  const admin = await createAdminClient<AppealRpcSchema>({
    noCookie: true,
    ...(actorId ? { auditActorId: actorId } : {}),
  });
  return {
    async request(input) {
      const { data, error } = await admin.rpc('email_appeal_request', {
        p_ws_id: input.wsId,
        p_actor_id: input.actorId,
        p_email: input.email,
        p_reason: input.reason,
        p_token_hash: input.tokenHash,
      });
      if (error) throw storeError(error);
      return data;
    },
    async claimDelivery(id) {
      const { data, error } = await admin.rpc('email_appeal_claim_delivery', {
        p_id: id,
      });
      if (error) throw storeError(error);
      return data;
    },
    async markDelivery(id, outcome) {
      const { error } = await admin.rpc('email_appeal_mark_delivery', {
        p_id: id,
        p_outcome: outcome,
      });
      if (error) throw storeError(error);
    },
    async confirm(tokenHash) {
      const { data, error } = await admin.rpc('email_appeal_confirm', {
        p_token_hash: tokenHash,
      });
      if (error) throw storeError(error);
      return data;
    },
  };
}

const listSchema = z.object({
  entries: z.array(
    z.object({
      email: z.email(),
      reason: storedAppealReasonSchema,
      blocked_at: z.string(),
      source_event: z.string(),
      appealable: z.boolean(),
      status: z.string().nullable(),
      cooldown_until: z.string().nullable(),
    })
  ),
  total: z.number().int().nonnegative(),
});

export async function listAppeals(input: {
  wsId: string;
  actorId: string;
  search: string;
  page: number;
}) {
  const pageSize = 25;
  const admin = await createAdminClient<AppealRpcSchema>({
    noCookie: true,
    auditActorId: input.actorId,
  });
  const { data, error } = await admin.rpc('email_appeal_list', {
    p_ws_id: input.wsId,
    p_actor_id: input.actorId,
    p_search: input.search,
    p_offset: (input.page - 1) * pageSize,
    p_limit: pageSize,
  });
  if (error) throw storeError(error);
  const parsed = listSchema.safeParse(data);
  if (!parsed.success) throw new AppealError('store_unavailable');
  return {
    entries: parsed.data.entries.map((row) => ({
      email: row.email,
      reason: row.reason,
      createdAt: row.blocked_at,
      sourceEvent: row.source_event,
      status: row.status,
      appealable: row.appealable,
      cooldownUntil: row.cooldown_until,
    })),
    total: parsed.data.total,
    page: input.page,
    pageSize,
  };
}
