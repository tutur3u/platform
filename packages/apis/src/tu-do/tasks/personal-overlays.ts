import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Task } from '@tuturuuu/types/primitives/Task';

export type PersonalTaskMetadata = {
  labels: NonNullable<Task['labels']>;
  projects: NonNullable<Task['projects']>;
};

export function createEmptyPersonalTaskMetadata(): PersonalTaskMetadata {
  return {
    labels: [],
    projects: [],
  };
}

export function applyPersonalTaskMetadata<T extends Task>(
  task: T,
  metadata: PersonalTaskMetadata | undefined
): T {
  const resolvedMetadata = metadata ?? createEmptyPersonalTaskMetadata();

  return {
    ...task,
    labels: resolvedMetadata.labels,
    projects: resolvedMetadata.projects,
    label_ids: resolvedMetadata.labels.map((label) => label.id),
    project_ids: resolvedMetadata.projects.map((project) => project.id),
  } as T;
}

export async function loadPersonalTaskMetadata(
  sbAdmin: TypedSupabaseClient,
  userId: string,
  taskIds: string[]
) {
  const metadataByTaskId = new Map<string, PersonalTaskMetadata>();
  const uniqueTaskIds = [...new Set(taskIds.filter(Boolean))];

  if (uniqueTaskIds.length === 0) {
    return metadataByTaskId;
  }

  const [labelResult, projectResult] = await Promise.all([
    (sbAdmin as any)
      .from('task_user_override_labels')
      .select(
        `
        task_id,
        label:workspace_task_labels(
          id,
          name,
          color,
          created_at
        )
        `
      )
      .eq('user_id', userId)
      .in('task_id', uniqueTaskIds),
    (sbAdmin as any)
      .from('task_user_override_projects')
      .select(
        `
        task_id,
        project:task_projects(
          id,
          name,
          status
        )
        `
      )
      .eq('user_id', userId)
      .in('task_id', uniqueTaskIds),
  ]);

  if (labelResult.error) {
    throw new Error('PERSONAL_TASK_LABELS_QUERY_FAILED');
  }

  if (projectResult.error) {
    throw new Error('PERSONAL_TASK_PROJECTS_QUERY_FAILED');
  }

  for (const taskId of uniqueTaskIds) {
    metadataByTaskId.set(taskId, createEmptyPersonalTaskMetadata());
  }

  for (const row of labelResult.data ?? []) {
    if (!row?.task_id || !row.label?.id) continue;
    const metadata =
      metadataByTaskId.get(row.task_id) ?? createEmptyPersonalTaskMetadata();
    metadata.labels.push({
      id: row.label.id,
      name: row.label.name ?? '',
      color: row.label.color ?? '',
      created_at: row.label.created_at ?? '',
    });
    metadataByTaskId.set(row.task_id, metadata);
  }

  for (const row of projectResult.data ?? []) {
    if (!row?.task_id || !row.project?.id) continue;
    const metadata =
      metadataByTaskId.get(row.task_id) ?? createEmptyPersonalTaskMetadata();
    metadata.projects.push({
      id: row.project.id,
      name: row.project.name ?? '',
      status: row.project.status ?? '',
    });
    metadataByTaskId.set(row.task_id, metadata);
  }

  return metadataByTaskId;
}

export async function ensureTaskUserOverride(
  sbAdmin: TypedSupabaseClient,
  userId: string,
  taskId: string
) {
  const { error } = await (sbAdmin as any).from('task_user_overrides').upsert(
    {
      task_id: taskId,
      user_id: userId,
    },
    {
      ignoreDuplicates: true,
      onConflict: 'task_id,user_id',
    }
  );

  if (error) {
    throw new Error('TASK_USER_OVERRIDE_UPSERT_FAILED');
  }
}

export async function replacePersonalTaskLabels(
  sbAdmin: TypedSupabaseClient,
  userId: string,
  taskId: string,
  labelIds: string[]
) {
  await ensureTaskUserOverride(sbAdmin, userId, taskId);

  const { error: deleteError } = await (sbAdmin as any)
    .from('task_user_override_labels')
    .delete()
    .eq('user_id', userId)
    .eq('task_id', taskId);

  if (deleteError) {
    throw new Error('PERSONAL_TASK_LABELS_DELETE_FAILED');
  }

  const uniqueLabelIds = [...new Set(labelIds)];
  if (uniqueLabelIds.length === 0) {
    return;
  }

  const { error: insertError } = await (sbAdmin as any)
    .from('task_user_override_labels')
    .insert(
      uniqueLabelIds.map((labelId) => ({
        task_id: taskId,
        user_id: userId,
        label_id: labelId,
      }))
    );

  if (insertError && insertError.code !== '23505') {
    throw new Error('PERSONAL_TASK_LABELS_INSERT_FAILED');
  }
}

export async function replacePersonalTaskProjects(
  sbAdmin: TypedSupabaseClient,
  userId: string,
  taskId: string,
  projectIds: string[]
) {
  await ensureTaskUserOverride(sbAdmin, userId, taskId);

  const { error: deleteError } = await (sbAdmin as any)
    .from('task_user_override_projects')
    .delete()
    .eq('user_id', userId)
    .eq('task_id', taskId);

  if (deleteError) {
    throw new Error('PERSONAL_TASK_PROJECTS_DELETE_FAILED');
  }

  const uniqueProjectIds = [...new Set(projectIds)];
  if (uniqueProjectIds.length === 0) {
    return;
  }

  const { error: insertError } = await (sbAdmin as any)
    .from('task_user_override_projects')
    .insert(
      uniqueProjectIds.map((projectId) => ({
        task_id: taskId,
        user_id: userId,
        project_id: projectId,
      }))
    );

  if (insertError && insertError.code !== '23505') {
    throw new Error('PERSONAL_TASK_PROJECTS_INSERT_FAILED');
  }
}

export async function addPersonalTaskLabel(
  sbAdmin: TypedSupabaseClient,
  userId: string,
  taskId: string,
  labelId: string
) {
  await ensureTaskUserOverride(sbAdmin, userId, taskId);

  const { error } = await (sbAdmin as any)
    .from('task_user_override_labels')
    .insert({
      task_id: taskId,
      user_id: userId,
      label_id: labelId,
    });

  if (error && error.code !== '23505') {
    throw new Error('PERSONAL_TASK_LABEL_INSERT_FAILED');
  }
}

export async function removePersonalTaskLabel(
  sbAdmin: TypedSupabaseClient,
  userId: string,
  taskId: string,
  labelId: string
) {
  const { error } = await (sbAdmin as any)
    .from('task_user_override_labels')
    .delete()
    .eq('user_id', userId)
    .eq('task_id', taskId)
    .eq('label_id', labelId);

  if (error) {
    throw new Error('PERSONAL_TASK_LABEL_DELETE_FAILED');
  }
}

export async function addPersonalTaskProject(
  sbAdmin: TypedSupabaseClient,
  userId: string,
  taskId: string,
  projectId: string
) {
  await ensureTaskUserOverride(sbAdmin, userId, taskId);

  const { error } = await (sbAdmin as any)
    .from('task_user_override_projects')
    .insert({
      task_id: taskId,
      user_id: userId,
      project_id: projectId,
    });

  if (error && error.code !== '23505') {
    throw new Error('PERSONAL_TASK_PROJECT_INSERT_FAILED');
  }
}

export async function removePersonalTaskProject(
  sbAdmin: TypedSupabaseClient,
  userId: string,
  taskId: string,
  projectId: string
) {
  const { error } = await (sbAdmin as any)
    .from('task_user_override_projects')
    .delete()
    .eq('user_id', userId)
    .eq('task_id', taskId)
    .eq('project_id', projectId);

  if (error) {
    throw new Error('PERSONAL_TASK_PROJECT_DELETE_FAILED');
  }
}
