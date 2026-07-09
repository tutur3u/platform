import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

/**
 * Minimal authenticated-session shape shared by education-core helpers.
 *
 * Each app's own `SessionAuthContext` (from its `lib/api-auth`) is structurally
 * assignable to this, so call sites pass their context unchanged.
 */
export interface EducationAuthContext {
  user: SupabaseUser;
  supabase: TypedSupabaseClient;
}
