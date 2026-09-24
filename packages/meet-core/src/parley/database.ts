import 'server-only';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
export async function parleyDatabase() {
  return createAdminClient({ noCookie: true });
}
