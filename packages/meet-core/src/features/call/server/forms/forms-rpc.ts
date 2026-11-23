import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';

export function createMeetFormsAdmin() {
  return createAdminClient({ noCookie: true });
}
