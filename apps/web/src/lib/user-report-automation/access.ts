import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { verifySecret } from '@tuturuuu/utils/workspace-helper';

export const REPORT_EMAIL_SENDING_SECRET = 'ENABLE_REPORT_EMAIL_SENDING';
export const GLOBAL_EMAIL_SENDING_SECRET = 'ENABLE_EMAIL_SENDING';

export type PeriodicReportEmailAccess =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | 'global_email_disabled'
        | 'periodic_email_disabled'
        | 'sender_unavailable';
    };

export async function resolvePeriodicReportEmailAccess(wsId: string) {
  const [globalEnabled, periodicEnabled] = await Promise.all([
    verifySecret({
      forceAdmin: true,
      name: GLOBAL_EMAIL_SENDING_SECRET,
      value: 'true',
      wsId,
    }),
    verifySecret({
      forceAdmin: true,
      name: REPORT_EMAIL_SENDING_SECRET,
      value: 'true',
      wsId,
    }),
  ]);

  if (!globalEnabled) {
    return {
      allowed: false,
      reason: 'global_email_disabled',
    } satisfies PeriodicReportEmailAccess;
  }
  if (!periodicEnabled) {
    return {
      allowed: false,
      reason: 'periodic_email_disabled',
    } satisfies PeriodicReportEmailAccess;
  }
  const sbAdmin = await createAdminClient();
  const sender = await sbAdmin
    .from('workspace_email_credentials')
    .select('id')
    .eq('ws_id', wsId)
    .maybeSingle();
  if (sender.error || !sender.data) {
    return {
      allowed: false,
      reason: 'sender_unavailable',
    } satisfies PeriodicReportEmailAccess;
  }

  return { allowed: true } satisfies PeriodicReportEmailAccess;
}
