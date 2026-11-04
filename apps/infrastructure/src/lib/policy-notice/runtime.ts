import 'server-only';

import { EmailService } from '@tuturuuu/email-service';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { POLICY_CHANGE_NOTICE } from './definition';
import { createEmailServiceMailer } from './mailer';
import type { PolicyNoticeDeps } from './sender';
import { createSupabasePolicyNoticeStore } from './store';

export function createPolicyNoticeDeps(
  sbAdmin: TypedSupabaseClient
): PolicyNoticeDeps {
  return {
    notice: POLICY_CHANGE_NOTICE,
    store: createSupabasePolicyNoticeStore(sbAdmin),
    mailer: createEmailServiceMailer(() => EmailService.fromRootWorkspace()),
    clock: {
      now: () => Date.now(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    },
  };
}
