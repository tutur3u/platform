import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type {
  ExternalProjectBlock,
  ExternalProjectEntry,
  ExternalProjectEntryRelation,
  ExternalProjectRelationDefinition,
  ExternalProjectRelationDefinitionTarget,
  Json,
} from '@tuturuuu/types';
import { invalidateWorkspaceExternalProjectCache } from './cache';

type AdminDb = TypedSupabaseClient;

export type ExternalProjectRelationDefinitionWithTargets =
  ExternalProjectRelationDefinition & {
    targetCollectionIds: string[];
  };

export type ExternalProjectEntryBundle = {
  entry: ExternalProjectEntry;
  blocks: ExternalProjectBlock[];
  relations: ExternalProjectEntryRelation[];
};

export type ExternalProjectEntryBundleInput = {
  entry: {
    collectionId?: string;
    metadata?: Json;
    profileData?: Json;
    scheduledFor?: string | null;
    slug?: string;
    sortOrder?: number;
    sourceAdapter?: ExternalProjectEntry['source_adapter'];
    stableSourceId?: string | null;
    status?: ExternalProjectEntry['status'];
    subtitle?: string | null;
    summary?: string | null;
    title?: string;
  };
  blocks: Array<{
    blockType: string;
    content: Json;
    id?: string;
    sortOrder?: number;
    stableSourceId?: string | null;
    title?: string | null;
  }>;
  relations: Array<{
    definitionId: string;
    metadata?: Json;
    sortOrder?: number;
    toEntryId: string;
  }>;
};

export async function listWorkspaceExternalProjectRelationData(
  workspaceId: string,
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const [definitionsResult, targetsResult, relationsResult] = await Promise.all(
    [
      admin
        .from('workspace_external_project_relation_definitions')
        .select('*')
        .eq('ws_id', workspaceId)
        .order('sort_order', { ascending: true })
        .order('key', { ascending: true }),
      admin
        .from('workspace_external_project_relation_definition_targets')
        .select('*')
        .eq('ws_id', workspaceId),
      admin
        .from('workspace_external_project_entry_relations')
        .select('*')
        .eq('ws_id', workspaceId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
    ]
  );

  if (definitionsResult.error) throw new Error(definitionsResult.error.message);
  if (targetsResult.error) throw new Error(targetsResult.error.message);
  if (relationsResult.error) throw new Error(relationsResult.error.message);

  return {
    definitions: definitionsResult.data ?? [],
    relations: relationsResult.data ?? [],
    targets: targetsResult.data ?? [],
  };
}

export async function listWorkspaceExternalProjectRelationDefinitions(
  workspaceId: string,
  db?: AdminDb
): Promise<ExternalProjectRelationDefinitionWithTargets[]> {
  const { definitions, targets } =
    await listWorkspaceExternalProjectRelationData(workspaceId, db);

  return definitions.map((definition) => ({
    ...definition,
    targetCollectionIds: targets
      .filter((target) => target.relation_definition_id === definition.id)
      .map((target) => target.target_collection_id),
  }));
}

export async function createWorkspaceExternalProjectRelationDefinition(
  payload: {
    actorId: string;
    cardinality: 'one' | 'many';
    inverseLabel?: string | null;
    isRequired?: boolean;
    key: string;
    label: string;
    sortOrder?: number;
    sourceCollectionId: string;
    targetCollectionIds: string[];
    workspaceId: string;
  },
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { data: definition, error } = await admin
    .from('workspace_external_project_relation_definitions')
    .insert({
      cardinality: payload.cardinality,
      created_by: payload.actorId,
      inverse_label: payload.inverseLabel ?? null,
      is_required: payload.isRequired ?? false,
      key: payload.key,
      label: payload.label,
      sort_order: payload.sortOrder ?? 0,
      source_collection_id: payload.sourceCollectionId,
      updated_by: payload.actorId,
      ws_id: payload.workspaceId,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  const targets = [...new Set(payload.targetCollectionIds)].map(
    (targetCollectionId) => ({
      relation_definition_id: definition.id,
      target_collection_id: targetCollectionId,
      ws_id: payload.workspaceId,
    })
  );
  if (targets.length > 0) {
    const { error: targetError } = await admin
      .from('workspace_external_project_relation_definition_targets')
      .insert(targets);
    if (targetError) {
      await admin
        .from('workspace_external_project_relation_definitions')
        .delete()
        .eq('ws_id', payload.workspaceId)
        .eq('id', definition.id);
      throw new Error(targetError.message);
    }
  }

  await invalidateWorkspaceExternalProjectCache(payload.workspaceId);
  return { ...definition, targetCollectionIds: payload.targetCollectionIds };
}

export async function updateWorkspaceExternalProjectRelationDefinition(
  definitionId: string,
  payload: {
    actorId: string;
    cardinality?: 'one' | 'many';
    inverseLabel?: string | null;
    isRequired?: boolean;
    key?: string;
    label?: string;
    sortOrder?: number;
    sourceCollectionId?: string;
    targetCollectionIds?: string[];
    workspaceId: string;
  },
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { data: definition, error } = await admin
    .from('workspace_external_project_relation_definitions')
    .update({
      ...(payload.cardinality === undefined
        ? {}
        : { cardinality: payload.cardinality }),
      ...(payload.inverseLabel === undefined
        ? {}
        : { inverse_label: payload.inverseLabel }),
      ...(payload.isRequired === undefined
        ? {}
        : { is_required: payload.isRequired }),
      ...(payload.key === undefined ? {} : { key: payload.key }),
      ...(payload.label === undefined ? {} : { label: payload.label }),
      ...(payload.sortOrder === undefined
        ? {}
        : { sort_order: payload.sortOrder }),
      ...(payload.sourceCollectionId === undefined
        ? {}
        : { source_collection_id: payload.sourceCollectionId }),
      updated_by: payload.actorId,
    })
    .eq('ws_id', payload.workspaceId)
    .eq('id', definitionId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  if (payload.targetCollectionIds !== undefined) {
    const { error: deleteError } = await admin
      .from('workspace_external_project_relation_definition_targets')
      .delete()
      .eq('ws_id', payload.workspaceId)
      .eq('relation_definition_id', definitionId);
    if (deleteError) throw new Error(deleteError.message);

    const targets = [...new Set(payload.targetCollectionIds)].map(
      (targetCollectionId) => ({
        relation_definition_id: definitionId,
        target_collection_id: targetCollectionId,
        ws_id: payload.workspaceId,
      })
    );
    if (targets.length > 0) {
      const { error: targetError } = await admin
        .from('workspace_external_project_relation_definition_targets')
        .insert(targets);
      if (targetError) throw new Error(targetError.message);
    }
  }

  await invalidateWorkspaceExternalProjectCache(payload.workspaceId);
  const definitions = await listWorkspaceExternalProjectRelationDefinitions(
    payload.workspaceId,
    admin
  );
  return definitions.find((item) => item.id === definition.id) ?? null;
}

export async function deleteWorkspaceExternalProjectRelationDefinition(
  definitionId: string,
  workspaceId: string,
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { error } = await admin
    .from('workspace_external_project_relation_definitions')
    .delete()
    .eq('ws_id', workspaceId)
    .eq('id', definitionId);
  if (error) throw new Error(error.message);

  await invalidateWorkspaceExternalProjectCache(workspaceId);
  return { id: definitionId };
}

export async function upsertWorkspaceExternalProjectEntryBundle(
  payload: ExternalProjectEntryBundleInput & {
    actorId: string;
    entryId?: string;
    expectedUpdatedAt?: string;
    workspaceId: string;
  },
  db?: AdminDb
): Promise<ExternalProjectEntryBundle> {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { data, error } = await admin.rpc(
    'upsert_workspace_external_project_entry_bundle',
    {
      p_actor_id: payload.actorId,
      p_blocks: payload.blocks as Json,
      p_entry: payload.entry as Json,
      p_entry_id: payload.entryId,
      p_expected_updated_at: payload.expectedUpdatedAt,
      p_relations: payload.relations as Json,
      p_ws_id: payload.workspaceId,
    }
  );

  if (error) throw new Error(`${error.code ?? 'unknown'}:${error.message}`);
  await invalidateWorkspaceExternalProjectCache(payload.workspaceId);
  return data as unknown as ExternalProjectEntryBundle;
}

export type {
  ExternalProjectRelationDefinition,
  ExternalProjectRelationDefinitionTarget,
};
