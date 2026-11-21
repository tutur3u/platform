import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database, Json } from '@tuturuuu/types';
import type { z } from 'zod';
import { fleetJson } from '../session';

type PrivateSchema = Database['private'];
type Tier = PrivateSchema['Enums']['fleet_tier'];

type OwnerFunctions = {
  fleet_owner_list_access: { Args: { p_actor_id: string }; Returns: Json };
  fleet_owner_grant_access: {
    Args: {
      p_actor_id: string;
      p_email: string;
      p_tier: Tier;
      p_capabilities: string[];
      p_project_keys: string[];
      p_expires_at: string | null;
      p_questions_per_hour: number;
      p_intents_per_day: number;
      p_model_budget_per_month: number;
      p_expected_generation: string | null;
    };
    Returns: Json;
  };
  fleet_owner_revoke_access: {
    Args: {
      p_actor_id: string;
      p_user_id: string;
      p_expected_generation: string;
    };
    Returns: Json;
  };
  fleet_owner_set_stopped: {
    Args: {
      p_actor_id: string;
      p_stopped: boolean;
      p_expected_generation: string;
    };
    Returns: Json;
  };
  fleet_owner_upsert_project: {
    Args: {
      p_actor_id: string;
      p_key: string;
      p_name_en: string;
      p_name_vi: string;
    };
    Returns: Json;
  };
  fleet_owner_set_display_value: {
    Args: {
      p_actor_id: string;
      p_project_key: string;
      p_field: string;
      p_value: string;
      p_approved: boolean;
    };
    Returns: Json;
  };
};

// Generations are bigints, so the adapter sends them as decimal strings.
type FleetOwnerDatabase = Omit<Database, 'private'> & {
  private: Omit<PrivateSchema, 'Functions'> & {
    Functions: Omit<PrivateSchema['Functions'], keyof OwnerFunctions> &
      OwnerFunctions;
  };
};

export type FleetOwnerFunction = keyof OwnerFunctions;

/** Expected refusals map to fixed codes; anything else is unavailable. */
const refusalStatus: Record<string, number> = {
  unknown_user: 404,
  unknown_project: 404,
  not_found: 404,
  invalid_grant: 400,
  invalid_project: 400,
  invalid_value: 400,
  invalid_request: 400,
  grant_exists: 409,
  generation_changed: 409,
  already_revoked: 409,
  too_many_values: 409,
};

export function fleetOwnerUnavailable() {
  console.error('Fleet Owner operation unavailable');
  return fleetJson({ error: 'owner_unavailable' }, 503);
}

export async function callFleetOwner<Name extends FleetOwnerFunction>(
  name: Name,
  args: OwnerFunctions[Name]['Args'],
  success: z.ZodType
) {
  try {
    const db = await createAdminClient<FleetOwnerDatabase>({ noCookie: true });
    const { data, error } = await db.schema('private').rpc(name, args);
    if (error) {
      // The database refuses anyone but the configured Owner with 42501.
      return error.code === '42501'
        ? fleetJson({ error: 'forbidden' }, 403)
        : fleetOwnerUnavailable();
    }
    const parsed = success.safeParse(data);
    if (parsed.success) return fleetJson(parsed.data);
    const result =
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as { result?: unknown }).result
        : undefined;
    const status =
      typeof result === 'string' && Object.hasOwn(refusalStatus, result)
        ? refusalStatus[result]
        : undefined;
    if (status) return fleetJson({ error: result }, status);
  } catch {
    // Configuration and transport failures share the unavailable response.
  }
  return fleetOwnerUnavailable();
}
