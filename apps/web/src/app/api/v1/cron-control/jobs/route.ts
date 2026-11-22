import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  CRON_RELAY_NO_STORE,
  cronControlBinding,
  cronRelayError,
  refuseCronOperator,
} from '@/lib/infrastructure/cron-control-access';
import { listCronJobs } from '@/lib/infrastructure/cron-control-relay';

/**
 * Cron Control's job listing for a platform operator. Cron Control has no
 * public ingress; api-core relays over its CRON_CONTROL service binding.
 */
export const GET = withSessionAuth(async (request, { user, supabase }) => {
  const refusal = await refuseCronOperator(request, { user, supabase }, 'read');
  if (refusal) return refusal;
  const outcome = await listCronJobs(
    { CRON_CONTROL_RELAY_TOKEN: process.env.CRON_CONTROL_RELAY_TOKEN },
    cronControlBinding()
  );
  if (!outcome.ok) return cronRelayError(outcome.error, outcome.status);
  return NextResponse.json(outcome.body, { headers: CRON_RELAY_NO_STORE });
});
