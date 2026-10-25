import {
  logApiKeyUsage,
  validateApiKey,
  type WorkspaceContext,
} from '@tuturuuu/auth/api-keys';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { extractIPFromHeaders } from '@tuturuuu/utils/abuse-protection';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  bindDataset,
  DATASET_PERMISSION,
  type DatasetAccess,
  resolveDatasetWorkspaceAccess,
} from '@/lib/datasets/access';

/** Datasets live under AI Lab; API keys must carry the same permission. */
export const DATASET_API_KEY_PERMISSION = DATASET_PERMISSION;

type DatasetRouteHandler = (
  supabase: TypedSupabaseClient,
  scope: DatasetAccess
) => Promise<NextResponse>;

type WorkspaceDatasetsHandler = (
  supabase: TypedSupabaseClient,
  apiKeyContext: WorkspaceContext | null,
  scope: { wsId: string }
) => Promise<NextResponse | Denial>;

type Denial = { response: NextResponse; reason: string | null };

/**
 * Runs a dataset item route after proving that `datasetId` belongs to `wsId`.
 * The handler must keep every query bound to the verified dataset and
 * workspace. See {@link withWorkspaceDatasetsAccess} for key handling.
 */
export async function withDatasetAccess(
  request: Request,
  { wsId, datasetId }: { wsId: string; datasetId: string },
  handler: DatasetRouteHandler
): Promise<NextResponse> {
  return withWorkspaceDatasetsAccess(
    request,
    wsId,
    async (supabase, _key, scope) => {
      const access = await bindDataset(
        { supabase, wsId: scope.wsId },
        datasetId
      );
      if (!access.ok)
        return {
          response: access.response,
          reason:
            access.response.status === 404
              ? 'Dataset not found in workspace'
              : 'Dataset verification failed',
        };
      return handler(supabase, access);
    }
  );
}

/**
 * Runs a workspace dataset route for a session or API-key caller.
 *
 * API-key callers get an admin client, so the key must belong to the URL
 * workspace and carry {@link DATASET_API_KEY_PERMISSION}; the handler must
 * filter every query by `wsId`. Every request made with a verified key,
 * allowed or denied, is recorded in the key usage log.
 */
export async function withWorkspaceDatasetsAccess(
  request: Request,
  wsId: string,
  handler: WorkspaceDatasetsHandler
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
      handler,
      request,
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
  handler,
  request,
}: {
  request: Request;
  apiKey: string | null;
  apiKeyContext: WorkspaceContext | null;
  wsId: string;
  handler: WorkspaceDatasetsHandler;
}): Promise<NextResponse | Denial> {
  if (!apiKey) {
    const access = await resolveDatasetWorkspaceAccess(wsId, request);
    if (!access.ok)
      return {
        response: access.response,
        reason: 'Session dataset access denied',
      };
    return handler(access.supabase, null, { wsId: access.wsId });
  }

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

  return handler(await createAdminClient(), apiKeyContext, {
    wsId: apiKeyContext.wsId,
  });
}

/**
 * Proves that a dataset belongs to `wsId` and that the row (and column, when
 * given) belong to that dataset, so a cell write cannot link across datasets.
 */
export async function datasetCellParentsMatch(
  supabase: TypedSupabaseClient,
  {
    wsId,
    datasetId,
    rowId,
    columnId,
  }: { wsId: string; datasetId: string; rowId: string; columnId?: string }
): Promise<boolean> {
  if (
    typeof rowId !== 'string' ||
    (columnId !== undefined && typeof columnId !== 'string')
  ) {
    return false;
  }

  const checks: PromiseLike<{ data: unknown; error: unknown }>[] = [
    supabase
      .from('workspace_datasets')
      .select('id')
      .eq('id', datasetId)
      .eq('ws_id', wsId)
      .maybeSingle(),
    supabase
      .from('workspace_dataset_rows')
      .select('id')
      .eq('id', rowId)
      .eq('dataset_id', datasetId)
      .maybeSingle(),
  ];

  if (columnId !== undefined) {
    checks.push(
      supabase
        .from('workspace_dataset_columns')
        .select('id')
        .eq('id', columnId)
        .eq('dataset_id', datasetId)
        .maybeSingle()
    );
  }

  const results = await Promise.all(checks);
  return results.every(({ data, error }) => !error && Boolean(data));
}

function deny(status: number, message: string, reason: string): Denial {
  return { response: NextResponse.json({ message }, { status }), reason };
}
