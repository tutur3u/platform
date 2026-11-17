import { SHOW_VERSION_BADGE_CONFIG_ID } from '@tuturuuu/internal-api/users';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import {
  type CurrentUserReadContext,
  type SectionOutcome,
  timeDb,
} from './context';

const FORBIDDEN: SectionOutcome = {
  body: { message: 'Forbidden' },
  status: 403,
};
const FETCH_FAILED: SectionOutcome = {
  body: { message: 'Error fetching user config' },
  status: 500,
};

/** The version badge is limited to verified Tuturuuu staff sessions. */
async function isVersionBadgeForbidden(ctx: CurrentUserReadContext) {
  const { user } = ctx;
  return (
    !isExactTuturuuuDotComEmail(user.email) ||
    !isVerifiedTuturuuuStaffSession(
      user &&
        (await getVerifiedAuthUser(
          await createAdminClient({ noCookie: true }),
          user.id
        ))
    )
  );
}

async function isForbidden(ctx: CurrentUserReadContext, id: string) {
  return id === SHOW_VERSION_BADGE_CONFIG_ID && isVersionBadgeForbidden(ctx);
}

/** Body of `GET /api/v1/users/me/configs/:configId`. */
export async function readUserConfig(
  ctx: CurrentUserReadContext,
  id: string
): Promise<SectionOutcome> {
  const { supabase, user } = ctx;
  if (await isForbidden(ctx, id)) return FORBIDDEN;

  const { data, error } = await timeDb(ctx, () =>
    supabase
      .from('user_configs')
      .select('value')
      .eq('user_id', user.id)
      .eq('id', id)
      .maybeSingle()
  );

  if (error) {
    return { ...FETCH_FAILED, log: ['Error fetching user config:', error] };
  }

  return { body: { value: data?.value ?? null }, status: 200 };
}

/**
 * The same per-id results as `readUserConfig`, from one `user_configs` query.
 * Each id is gated independently, so a forbidden id never fails the others.
 */
export async function readUserConfigs(
  ctx: CurrentUserReadContext,
  ids: readonly string[]
): Promise<Record<string, SectionOutcome>> {
  const { supabase, user } = ctx;
  const results: Record<string, SectionOutcome> = {};
  const readable: string[] = [];
  for (const id of new Set(ids)) {
    if (await isForbidden(ctx, id)) {
      results[id] = FORBIDDEN;
    } else {
      readable.push(id);
    }
  }
  if (readable.length === 0) return results;

  const { data, error } = await timeDb(ctx, () =>
    supabase
      .from('user_configs')
      .select('id, value')
      .eq('user_id', user.id)
      .in('id', readable)
  );

  if (error) {
    for (const id of readable) results[id] = FETCH_FAILED;
    return results;
  }

  const values = new Map((data ?? []).map((row) => [row.id, row.value]));
  for (const id of readable) {
    results[id] = { body: { value: values.get(id) ?? null }, status: 200 };
  }
  return results;
}
