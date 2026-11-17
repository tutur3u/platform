import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database, Json } from '@tuturuuu/types';

type OperationArgs = { p_operation_id: string; p_actor_id: string };
type PrivateSchema = Database['private'];

// Keep the migration's RPC signatures local until the generated schema includes them.
type CitationRuntimeDatabase = Omit<Database, 'private'> & {
  private: Omit<PrivateSchema, 'Functions'> & {
    Functions: PrivateSchema['Functions'] & {
      reserve_cite_budget: {
        Args: {
          p_scope: 'lookup' | 'format' | 'ground';
          p_actor_hash: string;
          p_window: number;
          p_actor_limit: number;
          p_global_limit: number;
        };
        Returns: boolean;
      };
      claim_cite_ai_operation: {
        Args: OperationArgs & { p_binding: Json; p_retry_only: boolean };
        Returns: Json;
      };
      read_cite_ai_operation: { Args: OperationArgs; Returns: Json };
      transition_cite_ai_operation: {
        Args: OperationArgs & { p_previous: Json; p_next: Json };
        Returns: boolean;
      };
      claim_cite_ai_deduction: {
        Args: OperationArgs & { p_checkpoint: Json };
        Returns: boolean;
      };
    };
  };
};

export async function getCitationRuntimeDb() {
  const admin = await createAdminClient<CitationRuntimeDatabase>({
    noCookie: true,
  });
  return admin.schema('private');
}
