import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  CRON_RELAY_NO_STORE,
  cronControlBinding,
  cronRelayError,
  isCronOperator,
  refuseCronOperator,
} from '@/lib/infrastructure/cron-control-access';
import { resumeCronJob } from '@/lib/infrastructure/cron-control-relay';

/**
 * Resumes an enabled Cron Control job its own failure budget stopped, for a
 * platform operator with a recent second-factor proof. An operator stop
 * stays in force, and a disabled or unknown job is refused by Cron Control.
 * The gate also enforces same-origin proof and its own six-a-minute limit.
 */
export const POST = withSessionAuth<{ id: string }>(
  async (request, { user, supabase }, { id }) => {
    const refusal = await refuseCronOperator(
      request,
      { user, supabase },
      'resume'
    );
    if (refusal) return refusal;
    const outcome = await resumeCronJob(
      { CRON_CONTROL_RELAY_TOKEN: process.env.CRON_CONTROL_RELAY_TOKEN },
      cronControlBinding(),
      id
    );
    if (!outcome.ok) return cronRelayError(outcome.error, outcome.status);
    console.warn('Cron Control resume relayed', {
      actor: user.id,
      id,
      result: outcome.body.result,
    });
    return NextResponse.json(outcome.body, {
      status: outcome.status,
      headers: CRON_RELAY_NO_STORE,
    });
  },
  {
    // An operator's terminal cannot solve the browser Turnstile step-up; the
    // root permission and the fresh second-factor proof above are this
    // route's gate. Server reputation challenges still apply.
    stepUpExempt: (user) => isCronOperator(user),
  }
);
