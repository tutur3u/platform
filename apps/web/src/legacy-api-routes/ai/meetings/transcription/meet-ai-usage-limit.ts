import 'server-only';

import {
  checkMeetAiUsage,
  type MeetAiUsageInput,
} from '@tuturuuu/ai/meetings/usage-limit';
import { selectAbuseGuard } from '@tuturuuu/utils/abuse-guard/select';

/**
 * Vercel reaches the `meet` abuse-guard family over signed HTTPS
 * (ABUSE_GUARD_URL, ABUSE_GUARD_SECRET, ABUSE_GUARD_KEY_PEPPER and
 * ABUSE_GUARD_FAMILIES including `meet`). Limit overrides come from
 * server-only MEET_AI_LIMIT_* env vars. Any missing piece selects
 * `legacy`/`off`, which the limiter refuses with 503 (fail closed).
 */
export async function limitMeetAiUsageOnWeb(input: MeetAiUsageInput) {
  return checkMeetAiUsage(input, {
    selection: selectAbuseGuard('meet'),
    env: process.env,
  });
}
