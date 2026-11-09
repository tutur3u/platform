import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Json } from '@tuturuuu/types';
import { z } from 'zod';
import { getAppealTransport } from './transport';

type InventorySchema = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
    Functions: {
      email_appeal_recipient_candidates: {
        Args: {
          p_ws_id: string;
          p_actor_id: string;
          p_search: string;
          p_offset: number;
          p_limit: number;
        };
        Returns: Json;
      };
      email_appeal_record_provider_status: {
        Args: {
          p_ws_id: string;
          p_actor_id: string;
          p_email: string;
          p_status_json: Json;
        };
        Returns: Json;
      };
    };
  };
};
const candidatesSchema = z.object({
  entries: z.array(z.email()).max(25),
  total: z.number().int().nonnegative(),
});

export async function refreshAppealInventory(input: {
  wsId: string;
  actorId: string;
  search: string;
  page: number;
}) {
  const transport = await getAppealTransport();
  if (!transport) return 'unavailable' as const;
  try {
    const admin = await createAdminClient<InventorySchema>({
      noCookie: true,
      auditActorId: input.actorId,
    });
    const candidate = await admin.rpc('email_appeal_recipient_candidates', {
      p_ws_id: input.wsId,
      p_actor_id: input.actorId,
      p_search: input.search,
      p_offset: (input.page - 1) * 25,
      p_limit: 25,
    });
    if (candidate.error) return 'unavailable' as const;
    const parsed = candidatesSchema.safeParse(candidate.data);
    if (!parsed.success) return 'unavailable' as const;
    let complete = true;
    // At most one bounded page, four network lanes, no retries or scheduler.
    let position = 0;
    await Promise.all(
      Array.from(
        { length: Math.min(4, parsed.data.entries.length) },
        async () => {
          while (position < parsed.data.entries.length) {
            const email = parsed.data.entries[position++];
            if (!email) break;
            try {
              const status = await transport.lookupSuppression(email);
              if (status.status === 'unknown') {
                complete = false;
                continue;
              }
              const suppressed =
                status.status === 'blocked' || status.source !== 'clear';
              const observation =
                status.status === 'blocked'
                  ? {
                      account_id: status.accountId,
                      region: status.region,
                      suppressed: true,
                      reason: status.hardBounce ? 'BOUNCE' : 'COMPLAINT',
                      provider_generation: status.generation,
                    }
                  : {
                      account_id: transport.binding.sourceAccountId,
                      region: transport.binding.sourceRegion,
                      suppressed,
                      ...(suppressed
                        ? {
                            reason:
                              status.source === 'bounce'
                                ? 'BOUNCE'
                                : 'COMPLAINT',
                          }
                        : {}),
                      provider_generation: status.generation,
                    };
              const saved = await admin.rpc(
                'email_appeal_record_provider_status',
                {
                  p_ws_id: input.wsId,
                  p_actor_id: input.actorId,
                  p_email: email,
                  p_status_json: observation,
                }
              );
              if (saved.error) complete = false;
            } catch {
              complete = false;
            }
          }
        }
      )
    );
    return complete ? ('checked' as const) : ('partial' as const);
  } catch {
    return 'unavailable' as const;
  }
}
