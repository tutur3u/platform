import {
  logApiKeyUsage,
  validateApiKey,
  type WorkspaceContext,
} from '@tuturuuu/auth/api-keys';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { extractIPFromHeaders } from '@tuturuuu/utils/abuse-protection';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

/** Datasets live under AI Lab; API keys must carry the same permission. */
export const DATASET_API_KEY_PERMISSION = 'ai_lab';

type DatasetRouteHandler = (
  supabase: TypedSupabaseClient
) => Promise<NextResponse>;

type Denial = { response: NextResponse; reason: string | null };

/**
 * Runs a dataset route after proving that `datasetId` belongs to `wsId`.
 *
 * API-key callers get an admin client, so the key must belong to the URL
 * workspace and carry {@link DATASET_API_KEY_PERMISSION}; the handler must keep
 * every query bound to the verified dataset and workspace. Every request made
 * with a valid key, allowed or denied, is recorded in the key usage log.
 */
export async function withDatasetAccess(
  request: Request,
  { wsId, datasetId }: { wsId: string; datasetId: string },
  handler: DatasetRouteHandler
): Promise<NextResponse> {
  const startTime = Date.now();
  const requestHeaders = await headers();
  const apiKey = requestHeaders.get('API_KEY');
  const apiKeyContext = apiKey ? await validateApiKey(apiKey) : null;

  let statusCode = 500;
  let errorMessage: string | null = null;

  try {
    const result = await authorizeAndRun({
      apiKey,
      apiKeyContext,
      wsId,
      datasetId,
      handler,
    });
    if ('reason' in result) {
      errorMessage = result.reason;
      statusCode = result.response.status;
      return result.response;
    }
    statusCode = result.status;
    return result;
  } catch (error) {
    errorMessage = 'Unhandled dataset route error';
    throw error;
  } finally {
    // Without a verified key there is no key id to attribute the request to.
    if (apiKeyContext) {
      void logApiKeyUsage({
        apiKeyId: apiKeyContext.keyId,
        wsId: apiKeyContext.wsId,
        endpoint: new URL(request.url).pathname,
        method: request.method,
        statusCode,
        ipAddress: extractIPFromHeaders(requestHeaders),
        userAgent: requestHeaders.get('user-agent'),
        responseTimeMs: Date.now() - startTime,
        errorMessage,
      });
    }
  }
}

async function authorizeAndRun({
  apiKey,
  apiKeyContext,
  wsId,
  datasetId,
  handler,
}: {
  apiKey: string | null;
  apiKeyContext: WorkspaceContext | null;
  wsId: string;
  datasetId: string;
  handler: DatasetRouteHandler;
}): Promise<NextResponse | Denial> {
  let supabase: TypedSupabaseClient;

  if (apiKey) {
    if (!apiKeyContext || apiKeyContext.wsId !== wsId) {
      return deny(401, 'Invalid API key', 'API key workspace mismatch');
    }

    if (!apiKeyContext.permissions.includes(DATASET_API_KEY_PERMISSION)) {
      return deny(
        403,
        'Insufficient permissions',
        `API key lacks ${DATASET_API_KEY_PERMISSION} permission`
      );
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
    return deny(
      500,
      'Error verifying workspace dataset',
      'Dataset verification failed'
    );
  }

  if (!dataset) {
    return deny(404, 'Dataset not found', 'Dataset not found in workspace');
  }

  return handler(supabase);
}

function deny(status: number, message: string, reason: string): Denial {
  return { response: NextResponse.json({ message }, { status }), reason };
}
