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
      email_appeal_record_provider_status: {
        Args: {
          p_ws_id: string;
          p_actor_id: string;
          p_email: string;
          p_status_json: Json;
        };
        Returns: Json;
      };
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
      email_appeal_recipient_view: {
        Args: { p_appeal_id: string; p_actor_id: string };
        Returns: Json;
      };
      email_appeal_claim_bootstrap: {
        Args: {
          p_id: string;
          p_actor_id: string;
          p_token_hash: string;
          p_claims: Json;
        };
        Returns: Json;
      };
      email_appeal_claim_delivery: {
        Args: { p_id: string; p_binding: Json; p_provider_generation: string };
        Returns: Json;
      };
      email_appeal_mark_delivery: {
        Args: { p_id: string; p_outcome: string; p_message_id: string | null };
        Returns: Json;
      };
      email_appeal_preview: {
        Args: { p_token_hash: string; p_claims: Json };
        Returns: Json;
      };
      email_appeal_confirm: {
        Args: { p_token_hash: string; p_claims: Json };
        Returns: Json;
      };
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
    async recipientView(appealId, actorId) {
      const { data, error } = await admin.rpc('email_appeal_recipient_view', {
        p_appeal_id: appealId,
        p_actor_id: actorId,
      });
      if (error) throw storeError(error);
      return data;
    },
    async claimBootstrap(input) {
      const { data, error } = await admin.rpc('email_appeal_claim_bootstrap', {
        p_id: input.id,
        p_actor_id: input.actorId,
        p_token_hash: input.tokenHash,
        p_claims: input.claims,
      });
      if (error) throw storeError(error);
      return data;
    },
    async recordProviderStatus(wsId, actorId, email, status) {
      const { error } = await admin.rpc('email_appeal_record_provider_status', {
        p_ws_id: wsId,
        p_actor_id: actorId,
        p_email: email,
        p_status_json: status,
      });
      if (error) throw storeError(error);
    },
    async claimDelivery(id, binding, providerGeneration) {
      const { data, error } = await admin.rpc('email_appeal_claim_delivery', {
        p_id: id,
        p_provider_generation: providerGeneration,
        p_binding: {
          grant_id: binding.grantId,
          source_account_id: binding.sourceAccountId,
          source_region: binding.sourceRegion,
          account_id: binding.accountId,
          region: binding.region,
          identity: binding.identity,
          configuration_set: binding.configurationSet,
          ip_pool: binding.ipPool,
          purpose: binding.purpose,
          confirmation_origin: binding.confirmationOrigin,
        },
      });
      if (error) throw storeError(error);
      return data;
    },
    async markDelivery(id, outcome, messageId) {
      const { error } = await admin.rpc('email_appeal_mark_delivery', {
        p_id: id,
        p_outcome: outcome,
        p_message_id: messageId ?? null,
      });
      if (error) throw storeError(error);
    },
    async preview(tokenHash, claims) {
      const { data, error } = await admin.rpc('email_appeal_preview', {
        p_token_hash: tokenHash,
        p_claims: claims,
      });
      if (error) throw storeError(error);
      return data;
    },
    async confirm(tokenHash, claims) {
      const { data, error } = await admin.rpc('email_appeal_confirm', {
        p_token_hash: tokenHash,
        p_claims: claims,
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
