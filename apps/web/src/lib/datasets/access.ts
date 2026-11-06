import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export const DATASET_PERMISSION = 'ai_lab';

export async function resolveDatasetWorkspaceAccess(
  wsId: string,
  request?: Request
) {
  const session = await createClient(request);
  const { user, authError } = await resolveAuthenticatedSessionUser(session);
  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    } as const;
  }

  const permissions = await getPermissions({ wsId, user });
  if (!permissions) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: 'Workspace not found' },
        { status: 404 }
      ),
    } as const;
  }
  if (permissions.withoutPermission(DATASET_PERMISSION)) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      ),
    } as const;
  }

  return {
    ok: true,
    wsId: permissions.wsId,
    supabase: await createAdminClient(),
  } as const;
}

export async function resolveDatasetAccess(
  wsId: string,
  datasetId: string,
  request?: Request
) {
  const access = await resolveDatasetWorkspaceAccess(wsId, request);
  if (!access.ok) return access;
  return bindDataset(access, datasetId);
}

export async function bindDataset(
  access: { wsId: string; supabase: TypedSupabaseClient },
  datasetId: string
) {
  const { data: dataset, error } = await access.supabase
    .from('workspace_datasets')
    .select('*')
    .eq('ws_id', access.wsId)
    .eq('id', datasetId)
    .maybeSingle();
  if (error) {
    console.error('Error verifying workspace dataset:', error);
    return {
      ok: false,
      response: NextResponse.json(
        { message: 'Error verifying workspace dataset' },
        { status: 500 }
      ),
    } as const;
  }
  if (!dataset) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: 'Dataset not found' },
        { status: 404 }
      ),
    } as const;
  }
  return { ok: true, ...access, dataset, datasetId: dataset.id } as const;
}

export type DatasetAccess = Extract<
  Awaited<ReturnType<typeof resolveDatasetAccess>>,
  { ok: true }
>;
