import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types';

export type TypedSupabaseClient = SupabaseClient<Database>;
export type { SupabaseClient };
