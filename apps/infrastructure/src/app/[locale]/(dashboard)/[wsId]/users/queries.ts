import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types/supabase';

type PublicUser = Database['public']['Tables']['users']['Row'];
type PrivateProfile = Pick<
  Database['public']['Tables']['user_private_details']['Row'],
  'email' | 'full_name'
>;

export type InfrastructureUserRow = Pick<
  PublicUser,
  'id' | 'display_name' | 'handle' | 'created_at'
> & { email: string | null };

export interface UserSearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
}

const USER_PROJECTION =
  'id,display_name,handle,created_at,profile:user_private_details(email,full_name),private_match:user_private_details()';

function positiveInteger(value: string | undefined, fallback: number) {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function searchPattern(value: string) {
  // imatch is case-insensitive substring matching without LIKE's * alias.
  // Escape regex operators, then quote PostgREST's filter-value grammar.
  return JSON.stringify(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

function directoryRow(
  row: Pick<PublicUser, 'id' | 'display_name' | 'handle' | 'created_at'> & {
    profile: PrivateProfile | null;
  }
): InfrastructureUserRow {
  return {
    id: row.id,
    display_name: row.display_name || row.profile?.full_name || null,
    handle: row.handle,
    created_at: row.created_at,
    email: row.profile?.email ?? null,
  };
}

/** The caller must finish the verified Infrastructure read gate before admin creation. */
export async function getInfrastructureUsers(
  params: UserSearchParams,
  dependencies: {
    authorize: () => Promise<void>;
    createAdminClient: () => Promise<TypedSupabaseClient>;
  }
) {
  const size = Math.min(positiveInteger(params.pageSize, 10), 100);
  const page = positiveInteger(params.page, 1);
  const start = (page - 1) * size;
  if (!Number.isSafeInteger(start + size - 1))
    throw new RangeError('User page is out of range');
  await dependencies.authorize();
  const admin = await dependencies.createAdminClient();

  const query = admin
    .from('users')
    .select(USER_PROJECTION, { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  const search = params.q?.trim();
  if (search) {
    const pattern = searchPattern(search);
    // Separate left embeds keep the displayed profile unfiltered and retain
    // public-name/handle matches even when no private profile exists.
    query
      .or(`email.imatch.${pattern},full_name.imatch.${pattern}`, {
        referencedTable: 'private_match',
      })
      .or(
        `display_name.imatch.${pattern},handle.imatch.${pattern},private_match.not.is.null`
      );
  }
  const { data, error, count } = await query.range(start, start + size - 1);
  if (error) throw error;
  return { data: (data ?? []).map(directoryRow), count: count ?? 0 };
}
