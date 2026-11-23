import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export type ExternalAccountLinkRow = {
  external_email: string | null;
  external_subject: string;
  id: string;
  linked_at: string;
  provider: 'upskii';
  revoked_at: string | null;
  revoked_by: 'admin' | 'provider' | 'user' | null;
  scopes: string[];
  user_id: string;
};

export type LinkRevoker = NonNullable<ExternalAccountLinkRow['revoked_by']>;

export type NewExternalAccountLink = Pick<
  ExternalAccountLinkRow,
  'external_email' | 'external_subject' | 'scopes' | 'user_id'
>;

/** Storage for `private.external_account_links`, injectable for tests. */
export type ExternalAccountLinkStore = {
  findActiveBySubject(subject: string): Promise<ExternalAccountLinkRow | null>;
  findActiveByUser(userId: string): Promise<ExternalAccountLinkRow | null>;
  findById(id: string): Promise<ExternalAccountLinkRow | null>;
  /** Null when a concurrent link took one of the unique active slots. */
  insert(link: NewExternalAccountLink): Promise<ExternalAccountLinkRow | null>;
  /** True when this call revoked an active link. */
  revoke(id: string, by: LinkRevoker): Promise<boolean>;
  updateActive(
    id: string,
    patch: Pick<ExternalAccountLinkRow, 'external_email' | 'scopes'>
  ): Promise<ExternalAccountLinkRow>;
};

const COLUMNS =
  'id, user_id, provider, external_subject, external_email, scopes, linked_at, revoked_at, revoked_by';
const PROVIDER = 'upskii';
const UNIQUE_VIOLATION = '23505';

type QueryResult<T> = Promise<{
  data: T | null;
  error: { code?: string; message: string } | null;
}>;

// The table is not in the generated Database types yet, so the query builder
// is narrowed to the calls this store makes.
type LinkTable = {
  insert(row: Record<string, unknown>): {
    select(columns: string): { single(): QueryResult<ExternalAccountLinkRow> };
  };
  select(columns: string): LinkFilter;
  update(row: Record<string, unknown>): LinkFilter;
};
type LinkFilter = {
  eq(column: string, value: string): LinkFilter;
  is(column: string, value: null): LinkFilter;
  maybeSingle(): QueryResult<ExternalAccountLinkRow>;
  select(columns: string): LinkFilter;
  single(): QueryResult<ExternalAccountLinkRow>;
};

function table(admin: TypedSupabaseClient): LinkTable {
  const privateDb = admin.schema('private') as unknown as {
    from(name: 'external_account_links'): LinkTable;
  };
  return privateDb.from('external_account_links');
}

async function readOne(query: QueryResult<ExternalAccountLinkRow>) {
  const { data, error } = await query;
  if (error) throw new Error(`external_account_links: ${error.message}`);
  return data;
}

export function createExternalAccountLinkStore(
  admin: TypedSupabaseClient
): ExternalAccountLinkStore {
  const active = () =>
    table(admin)
      .select(COLUMNS)
      .eq('provider', PROVIDER)
      .is('revoked_at', null);

  return {
    findActiveBySubject: (subject) =>
      readOne(active().eq('external_subject', subject).maybeSingle()),
    findActiveByUser: (userId) =>
      readOne(active().eq('user_id', userId).maybeSingle()),
    findById: (id) =>
      readOne(
        table(admin)
          .select(COLUMNS)
          .eq('provider', PROVIDER)
          .eq('id', id)
          .maybeSingle()
      ),
    async insert(link) {
      const { data, error } = await table(admin)
        .insert({ ...link, provider: PROVIDER })
        .select(COLUMNS)
        .single();
      if (error?.code === UNIQUE_VIOLATION) return null;
      if (error) throw new Error(`external_account_links: ${error.message}`);
      return data;
    },
    async revoke(id, by) {
      const now = new Date().toISOString();
      const row = await readOne(
        table(admin)
          .update({ revoked_at: now, revoked_by: by, updated_at: now })
          .eq('id', id)
          .is('revoked_at', null)
          .select(COLUMNS)
          .maybeSingle()
      );
      return row !== null;
    },
    async updateActive(id, patch) {
      const row = await readOne(
        table(admin)
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq('id', id)
          .is('revoked_at', null)
          .select(COLUMNS)
          .single()
      );
      if (!row) throw new Error('external_account_links: link not active');
      return row;
    },
  };
}
