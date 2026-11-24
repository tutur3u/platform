import 'server-only';
import type { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  sanitizeMeetingName,
  truncateGraphemes,
} from '@tuturuuu/utils/meeting-name';

type Admin = Awaited<ReturnType<typeof createAdminClient>>;

const MAX_HOST_NAME_LENGTH = 80;

/**
 * The name an instant meeting is titled after: the saved profile display name,
 * then the account's own metadata. Empty when none is set, in which case the
 * meeting keeps the untitled default.
 */
export async function readMeetingHostName(
  admin: Admin,
  accountId: string,
  metadata?: { display_name?: unknown; full_name?: unknown } | null
) {
  const saved = await Promise.resolve(
    admin.from('users').select('display_name').eq('id', accountId).maybeSingle()
  )
    .then(({ data }) => data?.display_name)
    .catch(() => null);
  const name = [saved, metadata?.display_name, metadata?.full_name].find(
    (value): value is string => typeof value === 'string' && !!value.trim()
  );
  return name
    ? truncateGraphemes(sanitizeMeetingName(name), MAX_HOST_NAME_LENGTH)
    : '';
}
