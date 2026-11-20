import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database, Json } from '@tuturuuu/types';

// The Forms migration owner can regenerate these signatures when the RPCs land.
type FormsDatabase = Database & {
  public: {
    Functions: {
      commit_form_response: {
        Args: { p_submission: Json };
        Returns: Json;
      };
      meet_form_creation: {
        Args: { p_scope: Json; p_operation: string; p_value: Json };
        Returns: Json;
      };
    };
  };
};

export function createMeetFormsAdmin() {
  return createAdminClient<FormsDatabase>({ noCookie: true });
}
