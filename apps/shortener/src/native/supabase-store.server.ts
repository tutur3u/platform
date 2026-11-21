import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import type {
  ShortLinkByIdRecord,
  ShortLinkRecord,
  ShortLinkStore,
} from '../link/store';

const UNDEFINED_COLUMN = '42703';

// `ReturnType` of the generic factory resolves `T` to `unknown`, which types
// every table as `never`; instantiate it with the generated schema instead.
type AdminClient = Awaited<ReturnType<typeof createAdminClient<Database>>>;

/**
 * Service-role store used by the public redirect surface. A missing,
 * duplicated or unreadable row resolves to null, matching `.single()` errors
 * in the legacy page.
 */
export function createSupabaseLinkStore(
  fetcher: typeof fetch = fetch
): ShortLinkStore {
  let client: Promise<AdminClient> | undefined;
  const admin = () => {
    client ??= Promise.resolve(
      createAdminClient({ noCookie: true, fetch: fetcher })
    );
    return client;
  };
  // `expires_at` arrives with a migration; until it is applied, PostgREST
  // answers 42703 (undefined column) and the lookup retries without expiry so
  // existing links keep resolving.
  async function lookup<T>(
    column: 'slug' | 'id',
    value: string,
    columns: string
  ): Promise<T | null> {
    const read = async (select: string) =>
      (await admin())
        .from('shortened_links')
        .select(select)
        .eq(column, value)
        .single();
    let { data, error } = await read(`${columns}, expires_at`);
    if (error?.code === UNDEFINED_COLUMN)
      ({ data, error } = await read(columns));
    return error || !data ? null : (data as T);
  }
  return {
    findBySlug: (slug) =>
      lookup<ShortLinkRecord>(
        'slug',
        slug,
        'id, link, password_hash, password_hint'
      ),
    findById: (id) =>
      lookup<ShortLinkByIdRecord>('id', id, 'id, link, password_hash'),
    async recordClick(record) {
      const { error } = await (
        await admin()
      )
        .from('link_analytics')
        .insert(record);
      if (error) throw error;
    },
  };
}
