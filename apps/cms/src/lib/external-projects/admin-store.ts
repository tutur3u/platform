import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type {
  CanonicalExternalProject,
  ExternalProjectWorkspaceBindingSummary,
  Json,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { resolveWorkspaceExternalProjectBinding } from './access';
import {
  EXTERNAL_PROJECT_CANONICAL_ID_SECRET,
  EXTERNAL_PROJECT_ENABLED_SECRET,
} from './constants';

type AdminDb = TypedSupabaseClient;
const WORKSPACE_SECRET_QUERY_CHUNK_SIZE = 100;

export class CmsExternalProjectAdminError extends Error {
  constructor(
    message: string,
    public readonly status = 500
  ) {
    super(message);
    this.name = 'CmsExternalProjectAdminError';
  }
}

function chunkValues<T>(values: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

async function listExternalProjectWorkspaceSecrets(
  admin: AdminDb,
  workspaceIds: string[]
) {
  if (workspaceIds.length === 0) {
    return [];
  }

  const rows: Array<{ name: string; value: string | null; ws_id: string }> = [];

  for (const workspaceIdChunk of chunkValues(
    workspaceIds,
    WORKSPACE_SECRET_QUERY_CHUNK_SIZE
  )) {
    const { data, error } = await admin
      .from('workspace_secrets')
      .select('ws_id, name, value')
      .in('ws_id', workspaceIdChunk)
      .in('name', [
        EXTERNAL_PROJECT_ENABLED_SECRET,
        EXTERNAL_PROJECT_CANONICAL_ID_SECRET,
      ]);

    if (error) {
      throw new Error(error.message);
    }

    rows.push(...(data ?? []));
  }

  return rows;
}

export async function listCanonicalExternalProjects(db?: AdminDb) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { data, error } = await admin
    .from('canonical_external_projects')
    .select('*')
    .order('display_name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function listWorkspaceExternalProjectBindingAudits(db?: AdminDb) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { data, error } = await admin
    .from('workspace_external_project_binding_audits')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function createCanonicalExternalProject(
  payload: {
    actorId: string;
    adapter: CanonicalExternalProject['adapter'];
    allowed_collections: CanonicalExternalProject['allowed_collections'];
    allowed_features: CanonicalExternalProject['allowed_features'];
    delivery_profile: Json;
    display_name: string;
    id: string;
    is_active: boolean;
    metadata: Json;
  },
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { actorId, ...values } = payload;
  const { data, error } = await admin
    .from('canonical_external_projects')
    .insert({
      ...values,
      created_by: actorId,
      updated_by: actorId,
    })
    .select('*')
    .single();

  if (error) {
    throw new CmsExternalProjectAdminError(error.message);
  }

  return data;
}

export async function updateCanonicalExternalProject(
  canonicalId: string,
  payload: Partial<{
    adapter: CanonicalExternalProject['adapter'];
    allowed_collections: CanonicalExternalProject['allowed_collections'];
    allowed_features: CanonicalExternalProject['allowed_features'];
    delivery_profile: Json;
    display_name: string;
    is_active: boolean;
    metadata: Json;
  }> & {
    actorId: string;
  },
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { actorId, ...values } = payload;
  const { data, error } = await admin
    .from('canonical_external_projects')
    .update({
      ...values,
      updated_by: actorId,
    })
    .eq('id', canonicalId)
    .select('*')
    .single();

  if (error) {
    throw new CmsExternalProjectAdminError(error.message);
  }

  return data;
}

export async function updateWorkspaceExternalProjectBinding({
  actorId,
  canonicalId,
  db,
  workspaceId,
}: {
  actorId: string;
  canonicalId: string | null;
  db?: AdminDb;
  workspaceId: string;
}): Promise<WorkspaceExternalProjectBinding> {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);

  if (workspaceId === ROOT_WORKSPACE_ID) {
    throw new CmsExternalProjectAdminError(
      'Root workspace cannot be used as a destination site project',
      400
    );
  }

  const { data: workspace, error: workspaceError } = await admin
    .from('workspaces')
    .select('id')
    .eq('id', workspaceId)
    .maybeSingle();

  if (workspaceError) {
    throw new CmsExternalProjectAdminError(workspaceError.message);
  }

  if (!workspace) {
    throw new CmsExternalProjectAdminError('Workspace not found', 404);
  }

  if (canonicalId) {
    const { data: project, error: projectError } = await admin
      .from('canonical_external_projects')
      .select('id')
      .eq('id', canonicalId)
      .eq('is_active', true)
      .maybeSingle();

    if (projectError) {
      throw new CmsExternalProjectAdminError(projectError.message);
    }

    if (!project) {
      throw new CmsExternalProjectAdminError(
        'Site template is missing or inactive',
        400
      );
    }
  }

  const { data: previousSecret, error: previousError } = await admin
    .from('workspace_secrets')
    .select('value')
    .eq('ws_id', workspaceId)
    .eq('name', EXTERNAL_PROJECT_CANONICAL_ID_SECRET)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previousError) {
    throw new CmsExternalProjectAdminError(previousError.message);
  }

  const previousCanonicalId = previousSecret?.value ?? null;
  const { error: deleteError } = await admin
    .from('workspace_secrets')
    .delete()
    .eq('ws_id', workspaceId)
    .in('name', [
      EXTERNAL_PROJECT_ENABLED_SECRET,
      EXTERNAL_PROJECT_CANONICAL_ID_SECRET,
    ]);

  if (deleteError) {
    throw new CmsExternalProjectAdminError(deleteError.message);
  }

  if (canonicalId) {
    const { error: insertSecretsError } = await admin
      .from('workspace_secrets')
      .insert([
        {
          name: EXTERNAL_PROJECT_ENABLED_SECRET,
          value: 'true',
          ws_id: workspaceId,
        },
        {
          name: EXTERNAL_PROJECT_CANONICAL_ID_SECRET,
          value: canonicalId,
          ws_id: workspaceId,
        },
      ]);

    if (insertSecretsError) {
      throw new CmsExternalProjectAdminError(insertSecretsError.message);
    }
  }

  const { error: auditError } = await admin
    .from('workspace_external_project_binding_audits')
    .insert({
      actor_user_id: actorId,
      destination_ws_id: workspaceId,
      next_canonical_id: canonicalId,
      previous_canonical_id: previousCanonicalId,
      source_ws_id: ROOT_WORKSPACE_ID,
    });

  if (auditError) {
    throw new CmsExternalProjectAdminError(auditError.message);
  }

  return resolveWorkspaceExternalProjectBinding(workspaceId, admin);
}

export async function listExternalProjectWorkspaceBindingSummaries(
  db?: AdminDb
): Promise<ExternalProjectWorkspaceBindingSummary[]> {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const [{ data: workspaces, error: workspacesError }, canonicalProjects] =
    await Promise.all([
      admin
        .from('workspaces')
        .select('id, name, personal, avatar_url, logo_url')
        .order('personal', { ascending: true })
        .order('name', { ascending: true }),
      listCanonicalExternalProjects(admin),
    ]);

  if (workspacesError) {
    throw new Error(workspacesError.message);
  }

  const workspaceIds = (workspaces ?? []).map((workspace) => workspace.id);
  const [secrets, { data: audits, error: auditsError }] = await Promise.all([
    listExternalProjectWorkspaceSecrets(admin, workspaceIds),
    admin
      .from('workspace_external_project_binding_audits')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(500),
  ]);

  if (auditsError) {
    throw new Error(auditsError.message);
  }

  const projectById = new Map(
    canonicalProjects.map((project) => [project.id, project])
  );
  const secretsByWorkspace = new Map<
    string,
    Array<{ name: string; value: string }>
  >();

  for (const secret of secrets ?? []) {
    if (secret.value === null) {
      continue;
    }

    const rows = secretsByWorkspace.get(secret.ws_id) ?? [];
    rows.push({ name: secret.name, value: secret.value });
    secretsByWorkspace.set(secret.ws_id, rows);
  }

  const latestAuditByWorkspace = new Map<
    string,
    NonNullable<typeof audits>[number]
  >();
  for (const audit of audits ?? []) {
    if (!latestAuditByWorkspace.has(audit.destination_ws_id)) {
      latestAuditByWorkspace.set(audit.destination_ws_id, audit);
    }
  }

  return (workspaces ?? []).map((workspace) => {
    const workspaceSecrets = secretsByWorkspace.get(workspace.id) ?? [];
    const enabled = workspaceSecrets.some(
      (secret) =>
        secret.name === EXTERNAL_PROJECT_ENABLED_SECRET &&
        secret.value === 'true'
    );
    const canonicalId =
      workspaceSecrets.find(
        (secret) => secret.name === EXTERNAL_PROJECT_CANONICAL_ID_SECRET
      )?.value ?? null;
    const canonicalProject: CanonicalExternalProject | null =
      canonicalId && enabled ? (projectById.get(canonicalId) ?? null) : null;
    const latestAudit = latestAuditByWorkspace.get(workspace.id) ?? null;

    return {
      avatar_url: workspace.avatar_url,
      binding: {
        adapter: canonicalProject?.adapter ?? null,
        canonical_id: canonicalId,
        canonical_project:
          enabled && canonicalProject?.is_active ? canonicalProject : null,
        enabled:
          enabled &&
          Boolean(canonicalId) &&
          Boolean(canonicalProject?.is_active),
        workspace_id: workspace.id,
      },
      created_by_me: false,
      id: workspace.id,
      last_actor_user_id: latestAudit?.actor_user_id ?? null,
      last_audit_id: latestAudit?.id ?? null,
      last_changed_at: latestAudit?.changed_at ?? null,
      last_next_canonical_id: latestAudit?.next_canonical_id ?? null,
      last_previous_canonical_id: latestAudit?.previous_canonical_id ?? null,
      logo_url: workspace.logo_url,
      name: workspace.name,
      personal: workspace.personal,
    } satisfies ExternalProjectWorkspaceBindingSummary;
  });
}
