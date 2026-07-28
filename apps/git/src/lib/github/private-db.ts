import type { SupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';

export type AdminClient = SupabaseClient<Database>;

export function privateDb(db: AdminClient) {
  return db.schema('private') as unknown as {
    from: (table: string) => any;
  };
}
