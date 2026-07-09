import { createAdminClient } from '@tuturuuu/supabase/next/server';

import type { Db } from './types';

export async function getAdmin(db?: Db) {
  return db ?? ((await createAdminClient()) as Db);
}
