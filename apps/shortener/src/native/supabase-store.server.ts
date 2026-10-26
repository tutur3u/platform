import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import type { ShortLinkStore } from '../link/store';

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
  return {
    async findBySlug(slug) {
      const { data, error } = await (await admin())
        .from('shortened_links')
        .select('id, link, password_hash, password_hint')
        .eq('slug', slug)
        .single();
      return error || !data ? null : data;
    },
    async findById(id) {
      const { data, error } = await (await admin())
        .from('shortened_links')
        .select('id, link, password_hash')
        .eq('id', id)
        .single();
      return error || !data ? null : data;
    },
    async recordClick(record) {
      const { error } = await (await admin())
        .from('link_analytics')
        .insert(record);
      if (error) throw error;
    },
  };
}
