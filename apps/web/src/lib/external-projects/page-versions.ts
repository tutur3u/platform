import {
  CMS_BLOCKS_SCHEMA_VERSION,
  CMS_PAGE_VERSION_MAX_BYTES,
  cmsPageSchema,
} from '@tuturuuu/cms-blocks/schema';
import type {
  SupabaseClient,
  TypedSupabaseClient,
} from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import { z } from 'zod';

// Until typegen runs on a database with 20261104140000 applied, these are the
// page-version table and publish RPC from that migration.
export type PageVersionRow = {
  created_at: string;
  created_by: string | null;
  data: Database['public']['Tables']['workspace_external_project_entries']['Row']['metadata'];
  entry_id: string;
  id: string;
  note: string | null;
  published_at: string | null;
  published_by: string | null;
  schema_version: number;
  status: 'draft' | 'published';
  version_number: number;
  ws_id: string;
};
type Public = Database['public'];
type PageVersionsDatabase = Omit<Database, 'public'> & {
  public: Omit<Public, 'Tables' | 'Functions'> & {
    Tables: Public['Tables'] & {
      workspace_external_project_page_versions: {
        Insert: Pick<PageVersionRow, 'data' | 'entry_id' | 'ws_id'> &
          Partial<PageVersionRow>;
        Relationships: [];
        Row: PageVersionRow;
        Update: never;
      };
    };
    Functions: Public['Functions'] & {
      publish_workspace_external_project_page_version: {
        Args: { p_actor_id: string; p_version_id: string; p_ws_id: string };
        Returns: PageVersionRow;
      };
      get_published_workspace_external_project_page_version: {
        Args: { p_entry_id: string; p_ws_id: string };
        Returns: PageVersionRow[];
      };
    };
  };
};

const TABLE = 'workspace_external_project_page_versions';
const SUMMARY_COLUMNS =
  'id, ws_id, entry_id, version_number, schema_version, status, note, created_by, created_at, published_by, published_at';

export const savePageVersionSchema = z.object({
  data: cmsPageSchema.refine(
    (data) =>
      new TextEncoder().encode(JSON.stringify(data)).byteLength <=
      CMS_PAGE_VERSION_MAX_BYTES,
    'Page is too large'
  ),
  note: z.string().trim().max(500).optional(),
  schemaVersion: z.literal(CMS_BLOCKS_SCHEMA_VERSION),
});

export class PageVersionError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 413,
    message: string
  ) {
    super(message);
  }
}

type Scope = { entryId: string; workspaceId: string };
const db = (admin: TypedSupabaseClient) =>
  admin as unknown as SupabaseClient<PageVersionsDatabase>;

// Postgres codes the migration raises for a caller's mistake, not a fault.
function toPageVersionError(error: { code?: string; message: string }) {
  if (error.code === '23503' || error.code === 'P0002')
    return new PageVersionError(404, 'Page version or entry not found');
  if (error.code === '42501') return new PageVersionError(403, 'Forbidden');
  if (error.code === '55000')
    return new PageVersionError(409, 'CMS project is not bound');
  if (error.code === '23514')
    return new PageVersionError(400, 'Invalid page version');
  return new Error(error.message);
}

export async function listPageVersions(
  admin: TypedSupabaseClient,
  { entryId, workspaceId }: Scope
) {
  const { data, error } = await db(admin)
    .from(TABLE)
    .select(SUMMARY_COLUMNS)
    .eq('ws_id', workspaceId)
    .eq('entry_id', entryId)
    .order('version_number', { ascending: false })
    .limit(200);
  if (error) throw toPageVersionError(error);
  return data;
}

export async function getPageVersion(
  admin: TypedSupabaseClient,
  { entryId, versionId, workspaceId }: Scope & { versionId: string }
) {
  const { data, error } = await db(admin)
    .from(TABLE)
    .select('*')
    .eq('ws_id', workspaceId)
    .eq('entry_id', entryId)
    .eq('id', versionId)
    .maybeSingle();
  if (error) throw toPageVersionError(error);
  if (!data) throw new PageVersionError(404, 'Page version not found');
  return data;
}

export async function savePageVersionDraft(
  admin: TypedSupabaseClient,
  {
    actorId,
    entryId,
    input,
    workspaceId,
  }: Scope & { actorId: string; input: z.infer<typeof savePageVersionSchema> }
) {
  // The composite foreign key rejects an entry outside workspaceId.
  const { data, error } = await db(admin)
    .from(TABLE)
    .insert({
      created_by: actorId,
      data: input.data as PageVersionRow['data'],
      entry_id: entryId,
      note: input.note ?? null,
      schema_version: input.schemaVersion,
      ws_id: workspaceId,
    })
    .select(SUMMARY_COLUMNS)
    .single();
  if (error) throw toPageVersionError(error);
  return data;
}

export async function publishPageVersion(
  admin: TypedSupabaseClient,
  {
    actorId,
    entryId,
    versionId,
    workspaceId,
  }: Scope & { actorId: string; versionId: string }
) {
  await getPageVersion(admin, { entryId, versionId, workspaceId });
  // The function re-checks the actor's publish permission in the database.
  const { data, error } = await db(admin).rpc(
    'publish_workspace_external_project_page_version',
    { p_actor_id: actorId, p_version_id: versionId, p_ws_id: workspaceId }
  );
  if (error) throw toPageVersionError(error);
  return data;
}

// Delivery read for the renderer: the entry's published version only, never a
// draft, or null when the page is unpublished. Service role only.
export async function getPublishedPageVersion(
  admin: TypedSupabaseClient,
  { entryId, workspaceId }: Scope
) {
  const { data, error } = await db(admin).rpc(
    'get_published_workspace_external_project_page_version',
    { p_entry_id: entryId, p_ws_id: workspaceId }
  );
  if (error) throw toPageVersionError(error);
  return data?.[0] ?? null;
}
