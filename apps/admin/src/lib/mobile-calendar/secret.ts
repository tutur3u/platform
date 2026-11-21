import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  decryptDataKey,
  decryptSecretValue,
} from '../mobile-deployment/crypto';

export const CALENDAR_GATEWAY_SECRET_NAME = 'mobile_calendar_gateway:v1';

export async function loadCalendarGatewaySecret(): Promise<string> {
  const db = await createAdminClient({ noCookie: true });
  const { data, error } = await db
    .from('workspace_secrets')
    .select('value')
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .eq('name', CALENDAR_GATEWAY_SECRET_NAME)
    .maybeSingle();
  if (error || !data?.value) throw new Error('Calendar gateway not configured');
  const envelope = JSON.parse(data.value);
  if (
    envelope.version !== 1 ||
    typeof envelope.encryptedDataKey !== 'string' ||
    typeof envelope.encryptedSecret !== 'string'
  ) {
    throw new Error('Invalid Calendar gateway secret envelope');
  }
  const key = await decryptDataKey(envelope.encryptedDataKey);
  try {
    return await decryptSecretValue(envelope.encryptedSecret, key);
  } finally {
    key.fill(0);
  }
}
