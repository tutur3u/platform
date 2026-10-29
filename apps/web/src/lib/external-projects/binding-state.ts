import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type {
  CanonicalExternalProject,
  ExternalProjectAdapterKind,
  Json,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import {
  EXTERNAL_PROJECT_CANONICAL_ID_SECRET,
  EXTERNAL_PROJECT_ENABLED_SECRET,
} from './constants';

type AdminDb = TypedSupabaseClient;

export function getDefaultCanonicalExternalProjectId(
  adapter: ExternalProjectAdapterKind
) {
  return `${adapter}-main`;
}

/**
 * Read the enabled flag + canonical id for a workspace.
 *
 * Dual-read rollout: prefer the first-class
 * `workspace_external_project_bindings` table (introduced by the CMS redesign).
 * Fall back to the legacy `workspace_secrets` pattern when no binding row exists
 * yet (e.g. a workspace that has not been backfilled, or before the migration is
 * applied). This keeps delivery working for every workspace regardless of
 * rollout state. The binding table is missing entirely until the migration runs,
 * in which case the query errors and we silently fall back to secrets.
 */
async function readWorkspaceExternalProjectBindingState(
  admin: AdminDb,
  workspaceId: string
): Promise<{
  canonicalId: string | null;
  enabled: boolean;
  settings: Json | null;
}> {
  try {
    const { data: binding, error: bindingError } = await admin
      .from('workspace_external_project_bindings')
      .select('canonical_project_id, is_enabled, settings')
      .eq('ws_id', workspaceId)
      .maybeSingle();

    if (!bindingError && binding) {
      return {
        canonicalId: binding.canonical_project_id ?? null,
        enabled: binding.is_enabled === true,
        settings: binding.settings,
      };
    }
  } catch {
    // Table not present yet (migration not applied) — fall through to secrets.
  }

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

  return {
    canonicalId:
      secrets?.find(
        (secret) => secret.name === EXTERNAL_PROJECT_CANONICAL_ID_SECRET
      )?.value ?? null,
    enabled:
      secrets?.some(
        (secret) =>
          secret.name === EXTERNAL_PROJECT_ENABLED_SECRET &&
          secret.value === 'true'
      ) ?? false,
    settings: null,
  };
}

export async function resolveWorkspaceExternalProjectBinding(
  workspaceId: string,
  db?: AdminDb
): Promise<WorkspaceExternalProjectBinding> {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);

  const { canonicalId, enabled, settings } =
    await readWorkspaceExternalProjectBindingState(admin, workspaceId);

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
    settings,
    workspace_id: workspaceId,
  };
}
