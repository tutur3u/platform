import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { isTuturuuuReviewEmail } from '@tuturuuu/utils/email/client';

/** Only a live, explicitly provisioned reviewer may open their own Mail workspace. */
export async function isManagedMailReviewer(user: {
  id: string;
  email?: string | null;
}) {
  if (!user.id || !isTuturuuuReviewEmail(user.email)) return false;

  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await admin.auth.admin.getUserById(user.id);
  const stored = data.user;
  if (error || !stored || !stored.email_confirmed_at) return false;
  const marker = stored?.app_metadata?.infrastructure_review_account;
  return Boolean(
    stored.email?.toLowerCase() === user.email?.trim().toLowerCase() &&
      (!stored.banned_until || Date.parse(stored.banned_until) <= Date.now()) &&
      marker &&
      typeof marker === 'object' &&
      (marker as { kind?: unknown }).kind === 'review'
  );
}
