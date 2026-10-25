import { validateApiKey, type WorkspaceContext } from '@tuturuuu/auth/api-keys';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

/** Datasets live under AI Lab; API keys must carry the same permission. */
export const DATASET_API_KEY_PERMISSION = 'ai_lab';

export type DatasetAccess =
  | {
      ok: true;
      supabase: TypedSupabaseClient;
      apiKeyContext: WorkspaceContext | null;
    }
  | { ok: false; response: NextResponse };

/**
 * Resolves the client for a dataset route and proves that `datasetId` belongs
 * to `wsId` before any other query runs.
 *
 * API-key callers get an admin client, so the key must belong to the URL
 * workspace, carry {@link DATASET_API_KEY_PERMISSION}, and every later query
 * must stay bound to the verified dataset and workspace.
 */
export async function resolveDatasetAccess({
  wsId,
  datasetId,
}: {
  wsId: string;
  datasetId: string;
}): Promise<DatasetAccess> {
  const apiKey = (await headers()).get('API_KEY');

  let supabase: TypedSupabaseClient;
  let apiKeyContext: WorkspaceContext | null = null;

  if (apiKey) {
    apiKeyContext = await validateApiKey(apiKey);

    if (!apiKeyContext || apiKeyContext.wsId !== wsId) {
      return {
        ok: false,
        response: NextResponse.json(
          { message: 'Invalid API key' },
          { status: 401 }
        ),
      };
    }

    if (!apiKeyContext.permissions.includes(DATASET_API_KEY_PERMISSION)) {
      return {
        ok: false,
        response: NextResponse.json(
          { message: 'Insufficient permissions' },
          { status: 403 }
        ),
      };
    }

    supabase = await createAdminClient();
  } else {
    supabase = await createClient();
  }

  const { data: dataset, error } = await supabase
    .from('workspace_datasets')
    .select('id')
    .eq('id', datasetId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (error) {
    console.error('Error verifying workspace dataset:', error);
    return {
      ok: false,
      response: NextResponse.json(
        { message: 'Error verifying workspace dataset' },
        { status: 500 }
      ),
    };
  }

  if (!dataset) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: 'Dataset not found' },
        { status: 404 }
      ),
    };
  }

  return { ok: true, supabase, apiKeyContext };
}
