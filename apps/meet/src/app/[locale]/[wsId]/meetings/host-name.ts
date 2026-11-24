import 'server-only';
import type { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  sanitizeMeetingName,
  truncateGraphemes,
} from '@tuturuuu/utils/meeting-name';

type Admin = Awaited<ReturnType<typeof createAdminClient>>;

/** User-perceived characters kept from a host's name. */
const MAX_HOST_NAME_LENGTH = 80;
/** UTF-16 units kept, so "{name}'s meeting" always fits the 255-unit API limit. */
const MAX_HOST_NAME_UNITS = 200;
/** Raw input is cut before sanitizing; a stored name is not trusted to be short. */
const RAW_LIMIT = 2048;

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
  // The first candidate that still has visible text after sanitizing wins, so
  // an invisible-only saved name falls through to the account's own names.
  for (const candidate of [
    saved,
    metadata?.display_name,
    metadata?.full_name,
  ]) {
    if (typeof candidate !== 'string') continue;
    const name = sanitizeMeetingName(candidate.slice(0, RAW_LIMIT));
    if (name)
      return truncateGraphemes(name, MAX_HOST_NAME_LENGTH, MAX_HOST_NAME_UNITS);
  }
  return '';
}
