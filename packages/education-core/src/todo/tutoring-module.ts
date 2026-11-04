import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

/**
 * `workspace_configs` id of the tutoring module toggle. Mirrors
 * `ENABLE_TUTORING_CONFIG_ID` in `@tuturuuu/internal-api/workspace-config-ids`
 * (a test keeps the two equal) so this package needs no dependency on it.
 */
export const ENABLE_TUTORING_CONFIG_ID = 'ENABLE_TUTORING';

/**
 * Mirrors `isWorkspaceFeatureEnabled` in the Contacts feature gate (which
 * renders the tutoring module) so the API and the UI agree: an explicit
 * `true`/`false` wins, and a missing value is on for shared workspaces
 * (`defaultEnabled: true`) and off for personal ones.
 */
export function isTutoringConfigEnabled({
  isPersonal,
  value,
}: {
  isPersonal: boolean;
  value: string | null | undefined;
}) {
  const normalized = value?.trim().toLowerCase();

  if (normalized === 'true') return true;
  if (normalized === 'false') return false;

  return !isPersonal;
}

/**
 * Reads the tutoring module toggle for a workspace. Fails closed: if the
 * toggle or the workspace cannot be read, the module is treated as off.
 */
export async function readTutoringModuleEnabled(
  db: TypedSupabaseClient,
  wsId: string
) {
  const [configResult, workspaceResult] = await Promise.all([
    db
      .from('workspace_configs')
      .select('value')
      .eq('ws_id', wsId)
      .eq('id', ENABLE_TUTORING_CONFIG_ID)
      .maybeSingle(),
    db.from('workspaces').select('personal').eq('id', wsId).maybeSingle(),
  ]);

  if (configResult.error || workspaceResult.error || !workspaceResult.data) {
    console.error('Failed to verify the tutoring module toggle', {
      error: configResult.error ?? workspaceResult.error,
      wsId,
    });
    return false;
  }

  return isTutoringConfigEnabled({
    isPersonal: Boolean(workspaceResult.data.personal),
    value: configResult.data?.value,
  });
}
