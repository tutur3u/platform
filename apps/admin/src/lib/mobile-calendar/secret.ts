import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { z } from 'zod';
import {
  decryptDataKey,
  decryptSecretValue,
} from '../mobile-deployment/crypto';
import {
  CalendarGatewayCredentialError,
  isCalendarGatewayCredential,
} from './credential';

export const CALENDAR_GATEWAY_SECRET_NAME = 'mobile_calendar_gateway:v1';
const envelopeSchema = z.object({
  version: z.literal(1),
  encryptedDataKey: z.string().min(1),
  encryptedSecret: z.string().min(1),
});

export async function loadCalendarGatewaySecret(): Promise<string> {
  const binding = process.env.MOBILE_CALENDAR_GATEWAY_SECRET;
  if (binding !== undefined) {
    if (!isCalendarGatewayCredential(binding)) {
      throw new CalendarGatewayCredentialError('invalid-binding');
    }
    return binding;
  }

  const db = await createAdminClient({ noCookie: true });
  const { data, error } = await db
    .from('workspace_secrets')
    .select('value')
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .eq('name', CALENDAR_GATEWAY_SECRET_NAME)
    .maybeSingle();
  if (error) throw new CalendarGatewayCredentialError('envelope-read');
  if (!data?.value) {
    throw new CalendarGatewayCredentialError('envelope-missing');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(data.value);
  } catch {
    throw new CalendarGatewayCredentialError('envelope-invalid');
  }
  const envelope = envelopeSchema.safeParse(payload);
  if (!envelope.success) {
    throw new CalendarGatewayCredentialError('envelope-invalid');
  }

  let key: Awaited<ReturnType<typeof decryptDataKey>> | undefined;
  let credential: string;
  try {
    key = await decryptDataKey(envelope.data.encryptedDataKey);
    credential = await decryptSecretValue(envelope.data.encryptedSecret, key);
  } catch {
    throw new CalendarGatewayCredentialError('envelope-decrypt');
  } finally {
    key?.fill(0);
  }
  if (!isCalendarGatewayCredential(credential)) {
    throw new CalendarGatewayCredentialError('credential-invalid');
  }
  return credential;
}
