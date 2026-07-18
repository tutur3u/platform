import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type {
  ExternalProjectDeliveryCollection,
  ExternalProjectStudioData,
} from '@tuturuuu/types';
import {
  buildDeliveryAssetUrl,
  buildExternalProjectLoadingData,
  EPM_IMAGE_PREVIEW_TRANSFORM,
  getExternalProjectAssetRevision,
  listWorkspaceExternalProjectAssetsByEntryIds,
  listWorkspaceExternalProjectBlocksByEntryIds,
  listWorkspaceExternalProjectCollections,
  listWorkspaceExternalProjectEntries,
  listWorkspaceExternalProjectFieldDefinitions,
} from './store';
import { listWorkspaceExternalProjectRelationData } from './store-relations';

type AdminDb = TypedSupabaseClient;

export async function getWorkspaceExternalProjectScopedStudioData(
  workspaceId: string,
  collectionSlugs: string[],
  db?: AdminDb
): Promise<ExternalProjectStudioData> {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const [allCollections, relationData] = await Promise.all([
    listWorkspaceExternalProjectCollections(workspaceId, admin),
    listWorkspaceExternalProjectRelationData(workspaceId, admin),
  ]);
  const requestedSlugs = new Set(collectionSlugs);
  const sourceCollections = allCollections.filter((collection) =>
    requestedSlugs.has(collection.slug)
  );
  const sourceCollectionIds = new Set(
    sourceCollections.map((collection) => collection.id)
  );
  const relationDefinitions = relationData.definitions.filter((definition) =>
    sourceCollectionIds.has(definition.source_collection_id)
  );
  const relationDefinitionIds = new Set(
    relationDefinitions.map((definition) => definition.id)
  );
  const relationDefinitionTargets = relationData.targets.filter((target) =>
    relationDefinitionIds.has(target.relation_definition_id)
  );
  const includedCollectionIds = new Set(sourceCollectionIds);
  for (const target of relationDefinitionTargets) {
    includedCollectionIds.add(target.target_collection_id);
  }

  const includedIds = [...includedCollectionIds];
  const sourceIds = [...sourceCollectionIds];
  const [entries, fieldDefinitions] = await Promise.all([
    includedIds.length
      ? listWorkspaceExternalProjectEntries(
          workspaceId,
          { collectionIds: includedIds, includeDrafts: true },
          admin
        )
      : Promise.resolve([]),
    sourceIds.length
      ? listWorkspaceExternalProjectFieldDefinitions(
          workspaceId,
          { collectionIds: sourceIds, includeDisabled: true },
          admin
        )
      : Promise.resolve([]),
  ]);
  const sourceEntryIds = new Set(
    entries
      .filter((entry) => sourceCollectionIds.has(entry.collection_id))
      .map((entry) => entry.id)
  );
  const sourceEntryIdList = [...sourceEntryIds];
  const [blocks, rawAssets] = await Promise.all([
    listWorkspaceExternalProjectBlocksByEntryIds(
      workspaceId,
      sourceEntryIdList,
      admin
    ),
    listWorkspaceExternalProjectAssetsByEntryIds(
      workspaceId,
      sourceEntryIdList,
      admin
    ),
  ]);
  const assets = rawAssets.map((asset) => {
    const assetUrl = buildDeliveryAssetUrl(workspaceId, asset);
    return {
      ...asset,
      asset_url: assetUrl,
      preview_url:
        asset.asset_type === 'image'
          ? buildDeliveryAssetUrl(workspaceId, asset, {
              transform: EPM_IMAGE_PREVIEW_TRANSFORM,
            })
          : assetUrl,
    };
  });
  const collections = allCollections.filter((collection) =>
    includedCollectionIds.has(collection.id)
  );
  const collectionsPayload: ExternalProjectDeliveryCollection[] =
    sourceCollections.map((collection) => ({
      ...collection,
      entries: entries
        .filter((entry) => entry.collection_id === collection.id)
        .map((entry) => ({
          ...entry,
          assets: assets
            .filter((asset) => asset.entry_id === entry.id)
            .map((asset) => ({
              alt_text: asset.alt_text,
              asset_type: asset.asset_type,
              assetUrl: asset.asset_url,
              block_id: asset.block_id,
              entry_id: asset.entry_id,
              id: asset.id,
              metadata: asset.metadata,
              sort_order: asset.sort_order,
              source_url: asset.source_url,
              storage_path: asset.storage_path,
              updated_at: asset.updated_at,
              assetRevision: getExternalProjectAssetRevision(asset.updated_at),
            })),
          blocks: blocks.filter((block) => block.entry_id === entry.id),
          relations: relationData.relations
            .filter((relation) => relation.from_entry_id === entry.id)
            .flatMap((relation) => {
              const definition = relationDefinitions.find(
                (item) => item.id === relation.relation_definition_id
              );
              return definition && relation.relation_definition_id
                ? [
                    {
                      definitionId: relation.relation_definition_id,
                      id: relation.id,
                      key: definition.key,
                      metadata: relation.metadata,
                      to_entry_id: relation.to_entry_id,
                    },
                  ]
                : [];
            }),
        })),
    }));

  return {
    assets,
    blocks,
    collections,
    entries,
    fieldDefinitions,
    importJobs: [],
    loadingData: buildExternalProjectLoadingData(
      entries[0]?.source_adapter ?? null,
      collectionsPayload
    ),
    publishEvents: [],
    relationDefinitions,
    relationDefinitionTargets,
    relations: relationData.relations.filter((relation) =>
      sourceEntryIds.has(relation.from_entry_id)
    ),
  };
}
