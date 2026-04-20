import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type {
  CanonicalExternalProject,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  getPermissions,
  normalizeWorkspaceId,
  type PermissionsResult,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import {
  EXTERNAL_PROJECT_CANONICAL_ID_SECRET,
  EXTERNAL_PROJECT_ENABLED_SECRET,
} from './constants';

type AdminDb = TypedSupabaseClient;

export function hasRootExternalProjectsAdminPermission(
  permissions: PermissionsResult | null
) {
  if (!permissions) return false;

  return (
    permissions.containsPermission('manage_external_projects') ||
    permissions.containsPermission('manage_workspace_roles')
  );
}

export async function resolveWorkspaceExternalProjectBinding(
  workspaceId: string,
  db?: AdminDb
): Promise<WorkspaceExternalProjectBinding> {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);

  const { data: secrets, error: secretsError } = await admin
    .from('workspace_secrets')
    .select('name, value')
    .eq('ws_id', workspaceId)
    .in('name', [
      EXTERNAL_PROJECT_ENABLED_SECRET,
      EXTERNAL_PROJECT_CANONICAL_ID_SECRET,
    ]);

  if (secretsError) {
    throw new Error(secretsError.message);
  }

  const enabled =
    secrets?.some(
      (secret) =>
        secret.name === EXTERNAL_PROJECT_ENABLED_SECRET &&
        secret.value === 'true'
    ) ?? false;
  const canonicalId =
    secrets?.find(
      (secret) => secret.name === EXTERNAL_PROJECT_CANONICAL_ID_SECRET
    )?.value ?? null;

  let canonicalProject: CanonicalExternalProject | null = null;

  if (canonicalId) {
    const { data } = await admin
      .from('canonical_external_projects')
      .select('*')
      .eq('id', canonicalId)
      .maybeSingle();

    canonicalProject = data;
  }

  return {
    adapter: canonicalProject?.adapter ?? null,
    canonical_id: canonicalId,
    canonical_project:
      enabled && canonicalProject?.is_active ? canonicalProject : null,
    enabled:
      enabled && Boolean(canonicalId) && Boolean(canonicalProject?.is_active),
    workspace_id: workspaceId,
  };
}

export async function requireRootExternalProjectsAdmin(request: Request) {
  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const permissions = await getPermissions({
    wsId: ROOT_WORKSPACE_ID,
    request,
  });

  if (!hasRootExternalProjectsAdminPermission(permissions)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    admin: (await createAdminClient()) as TypedSupabaseClient,
    permissions,
    supabase,
    user,
  };
}

type WorkspaceExternalProjectMode = 'read' | 'manage' | 'publish';

function hasWorkspaceExternalProjectPermission(
  permissions: PermissionsResult | null,
  mode: WorkspaceExternalProjectMode
) {
  if (!permissions) return false;
  if (permissions.containsPermission('manage_external_projects')) return true;
  if (mode === 'read') {
    return permissions.containsPermission('publish_external_projects');
  }
  if (mode === 'publish') {
    return permissions.containsPermission('publish_external_projects');
  }
  return false;
}

export async function requireWorkspaceExternalProjectAccess({
  mode,
  request,
  wsId,
}: {
  mode: WorkspaceExternalProjectMode;
  request: Request;
  wsId: string;
}) {
  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const normalizedWorkspaceId = await normalizeWorkspaceId(wsId, supabase);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const admin = (await createAdminClient()) as TypedSupabaseClient;
  const [workspacePermissions, rootPermissions] = await Promise.all([
    getPermissions({ wsId: normalizedWorkspaceId, request }),
    getPermissions({ wsId: ROOT_WORKSPACE_ID, request }),
  ]);

  const binding = await resolveWorkspaceExternalProjectBinding(
    normalizedWorkspaceId,
    admin
  );

  if (!binding.enabled || !binding.canonical_project) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'External project studio unavailable for this workspace' },
        { status: 404 }
      ),
    };
  }

  const allowed =
    hasWorkspaceExternalProjectPermission(workspacePermissions, mode) ||
    hasRootExternalProjectsAdminPermission(rootPermissions);

  if (!allowed) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    admin,
    binding,
    normalizedWorkspaceId,
    rootPermissions,
    user,
    workspacePermissions,
  };
}
