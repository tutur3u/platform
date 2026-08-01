import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { ExternalProjectSyncManifest, Json } from '@tuturuuu/types';
import { invalidateWorkspaceExternalProjectCache } from './cache';

export async function setWorkspaceCmsSiteTemplate({
  actorId,
  admin,
  template,
  workspaceId,
}: {
  actorId: string | null;
  admin: TypedSupabaseClient;
  template: NonNullable<ExternalProjectSyncManifest['template']>;
  workspaceId: string;
}) {
  const privateDb = admin.schema('private') as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<{ data: Json | null; error: { message: string } | null }>;
  };
  const { data, error } = await privateDb.rpc(
    'external_project_set_cms_site_template',
    {
      p_actor_user_id: actorId,
      p_template: template as Json,
      p_ws_id: workspaceId,
    }
  );
  if (error) throw new Error(error.message);
  await invalidateWorkspaceExternalProjectCache(workspaceId);
  return data;
}
