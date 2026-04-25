import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type {
  CanonicalExternalProject,
  ExternalProjectWorkspaceBindingSummary,
} from '@tuturuuu/types';
import {
  EXTERNAL_PROJECT_CANONICAL_ID_SECRET,
  EXTERNAL_PROJECT_ENABLED_SECRET,
} from './constants';

type AdminDb = TypedSupabaseClient;

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
  const [
    { data: secrets, error: secretsError },
    { data: audits, error: auditsError },
  ] = await Promise.all([
    workspaceIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : admin
          .from('workspace_secrets')
          .select('ws_id, name, value')
          .in('ws_id', workspaceIds)
          .in('name', [
            EXTERNAL_PROJECT_ENABLED_SECRET,
            EXTERNAL_PROJECT_CANONICAL_ID_SECRET,
          ]),
    admin
      .from('workspace_external_project_binding_audits')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(500),
  ]);

  if (secretsError) {
    throw new Error(secretsError.message);
  }

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
