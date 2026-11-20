import type {
  SupabaseClient,
  TypedSupabaseClient,
} from '@tuturuuu/supabase/types';
import type { Database, Json } from '@tuturuuu/types';

type PublicationProof = {
  id: string;
  ws_id: string;
  canonical_external_project_id: string;
  entry_id: string;
  published_at: string;
  asset_revisions: Json;
};

type ProofDatabase = Omit<Database, 'private'> & {
  private: Database['private'] & {
    Tables: {
      external_project_asset_publication_proofs: {
        Row: PublicationProof;
        Insert: PublicationProof;
        Update: never;
        Relationships: [];
      };
    };
  };
};

export function assetPublicationProofs(admin: TypedSupabaseClient) {
  return (admin as unknown as SupabaseClient<ProofDatabase>)
    .schema('private')
    .from('external_project_asset_publication_proofs');
}
