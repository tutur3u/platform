import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types/db';
import { documentColumns, type WorkspaceDocumentRow } from './present';

type PendingColumn = 'owner_id' | 'updated_at';

function isMissingColumn(
  error: Pick<PostgrestError, 'code' | 'message'> | null,
  columns: PendingColumn[]
) {
  if (!error) return false;

  const match =
    error.code === '42703' || error.code === 'PGRST200'
      ? /^column (?:(?:"?workspace_documents"?)\.)?"?(owner_id|updated_at)"?(?: of relation "workspace_documents")? does not exist\.?$/i.exec(
          error.message
        )
      : error.code === 'PGRST204'
        ? /^Could not find the '(owner_id|updated_at)' column of 'workspace_documents' in the schema cache\.?$/i.exec(
            error.message
          )
        : null;
  return columns.some((column) => column === match?.[1]?.toLowerCase());
}

// TODO: Remove after the workspace document owner and timestamp migrations reach production.
export async function selectDocumentsWithSchemaFallback(
  hierarchyEnabled: boolean,
  select: (columns: string) => PromiseLike<{
    data: unknown;
    error: PostgrestError | null;
    count?: number | null;
  }>
) {
  const result = await select(documentColumns(hierarchyEnabled));
  if (!isMissingColumn(result.error, ['owner_id', 'updated_at'])) {
    return { result, legacy: false };
  }

  console.warn('Workspace documents are using the legacy read schema');
  return {
    result: await select(documentColumns(hierarchyEnabled, false)),
    legacy: true,
  };
}

export function restoreDocumentMetadata(
  row: WorkspaceDocumentRow,
  legacy: boolean
): WorkspaceDocumentRow {
  return legacy ? { ...row, owner_id: null, updated_at: row.created_at } : row;
}

// TODO: Remove after the workspace document owner and timestamp migrations reach production.
export async function insertDocumentWithSchemaFallback(
  client: SupabaseClient<Database>,
  document: Omit<
    Database['public']['Tables']['workspace_documents']['Insert'],
    'owner_id'
  >,
  ownerId: string
) {
  const result = await client
    .from('workspace_documents')
    .insert({ ...document, owner_id: ownerId })
    .select('id')
    .single();
  if (!isMissingColumn(result.error, ['owner_id'])) return result;

  console.warn('Workspace documents are using the legacy create schema');
  return client
    .from('workspace_documents')
    .insert(document)
    .select('id')
    .single();
}
