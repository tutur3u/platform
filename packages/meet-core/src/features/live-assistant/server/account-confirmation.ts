import 'server-only';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getTranslations } from 'next-intl/server';
import { MEETING_APP } from '../../../runtime';
import { MeetCallAccessError } from '../../call/lib/call-access';
import type { MeetCallRouteAccess } from '../../call/server/room-service';
import { isMeetUxV2Enabled } from '../../call/server/ux-v2';
import {
  isMiraAccountConfirmed,
  MIRA_ACCOUNT_CONFIRMATION_KEY as KEY,
  MIRA_ACCOUNT_CONFIRMATION_VERSION as VERSION,
  type MiraConfirmationLocale,
} from '../account-confirmation';
import { hashMiraNotice } from '../mira-notice-hash';
import { MiraTtlCache } from '../mira-ttl-cache';

type ConfirmationStatus = 'confirmed' | 'required' | 'unavailable';
const confirmations = new MiraTtlCache<ConfirmationStatus>();
const isGuest = (access: MeetCallRouteAccess) =>
  'guest' in access && access.guest === true;
const unavailable = () =>
  new MeetCallAccessError(503, 'Mira confirmation is unavailable');

export function usesMiraAccountConfirmation() {
  return MEETING_APP === 'meet' && isMeetUxV2Enabled();
}

async function readConfirmation(userId: string): Promise<ConfirmationStatus> {
  try {
    const db = await createAdminClient({ noCookie: true });
    const { data, error } = await db.auth.admin.getUserById(userId);
    if (error || data.user?.id !== userId) return 'unavailable';
    return isMiraAccountConfirmed(data.user.app_metadata[KEY])
      ? 'confirmed'
      : 'required';
  } catch {
    return 'unavailable';
  }
}

export async function readMiraAccountConfirmation(access: MeetCallRouteAccess) {
  if (isGuest(access)) return 'guest';
  const userId = access.user.id;
  return confirmations.read(
    userId,
    () => readConfirmation(userId),
    (status) => status === 'confirmed'
  );
}

export async function requireMiraAccountConfirmation(
  access: MeetCallRouteAccess
) {
  const status = await readMiraAccountConfirmation(access);
  if (status === 'confirmed') return;
  if (status === 'unavailable') throw unavailable();
  throw new MeetCallAccessError(
    403,
    'Confirm your account before using Mira',
    'MIRA_ACCOUNT_CONFIRMATION_REQUIRED'
  );
}

function requireExpectedActor(
  access: MeetCallRouteAccess,
  expectedActorId: string
) {
  if (isGuest(access) || expectedActorId !== access.user.id)
    throw new MeetCallAccessError(403, 'Mira account changed');
  return access.user.id;
}

export async function confirmMiraAccount(
  access: MeetCallRouteAccess,
  expectedActorId: string,
  locale: MiraConfirmationLocale
) {
  const userId = requireExpectedActor(access, expectedActorId);
  const status = await readConfirmation(userId);
  if (status === 'confirmed') return;
  if (status !== 'required') throw unavailable();

  const t = await getTranslations({ locale, namespace: 'meet.mira_consent' });
  const marker = {
    version: VERSION,
    confirmedAt: new Date().toISOString(),
    locale,
    textHash: await hashMiraNotice(t('account_statement')),
  };
  const db = await createAdminClient({ noCookie: true });
  const { data, error } = await db.auth.admin.updateUserById(userId, {
    app_metadata: { [KEY]: marker },
  });
  const stored = data.user?.app_metadata[KEY];
  if (error || data.user?.id !== userId || !isMiraAccountConfirmed(stored))
    throw unavailable();
}

export async function withdrawMiraAccount(
  access: MeetCallRouteAccess,
  expectedActorId: string
) {
  const userId = requireExpectedActor(access, expectedActorId);
  confirmations.delete(userId);
  try {
    const db = await createAdminClient({ noCookie: true });
    // Auth merges app metadata and treats a null value as deletion.
    const { data, error } = await db.auth.admin.updateUserById(userId, {
      app_metadata: { [KEY]: null },
    });
    if (error || data.user?.id !== userId || KEY in data.user.app_metadata)
      throw unavailable();
  } finally {
    confirmations.delete(userId);
  }
}
