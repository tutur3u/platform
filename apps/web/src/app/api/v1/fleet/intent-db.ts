import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database, Json } from '@tuturuuu/types';

type PrivateSchema = Database['private'];

// Bind the private migration RPCs at this adapter until schema type generation.
type FleetIntentDatabase = Omit<Database, 'private'> & {
  private: Omit<PrivateSchema, 'Functions'> & {
    Functions: PrivateSchema['Functions'] & {
      fleet_create_link_code: {
        Args: { p_actor_id: string; p_code_hash: string };
        Returns: boolean;
      };
      fleet_verify_link_code: {
        Args: {
          p_code_hash: string;
          p_confirmation_hash: string;
          p_event: Json;
        };
        Returns: Json;
      };
      fleet_confirm_link_code: {
        Args: {
          p_actor_id: string;
          p_pending_id: string;
          p_confirmation_hash: string;
          p_preview?: boolean;
        };
        Returns: Json;
      };
      fleet_submit_resolved_intent: {
        Args: {
          p_kind: PrivateSchema['Enums']['fleet_intent_kind'];
          p_project_key: string;
          p_target_key: string | null;
          p_parameters: Json;
          p_actor_id?: string;
          p_event?: Json;
          p_redacted_quote?: string;
        };
        Returns: { intent_id: string | null; reason_code: string }[];
      };
      fleet_list_intents: {
        Args: { p_actor_id: string; p_before?: string };
        Returns: Json;
      };
    };
  };
};

export async function getFleetIntentDb() {
  const db = await createAdminClient<FleetIntentDatabase>({ noCookie: true });
  return db.schema('private');
}
