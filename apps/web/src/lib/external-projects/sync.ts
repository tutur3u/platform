import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type {
  ExternalProjectAsset,
  ExternalProjectBlock,
  ExternalProjectCollection,
  ExternalProjectEntry,
  ExternalProjectFieldDefinition,
  ExternalProjectStudioData,
  ExternalProjectSyncAction,
  ExternalProjectSyncApplyResult,
  ExternalProjectSyncAsset,
  ExternalProjectSyncBlock,
  ExternalProjectSyncCollectionSchema,
  ExternalProjectSyncDiff,
  ExternalProjectSyncEntry,
  ExternalProjectSyncField,
  ExternalProjectSyncManifest,
  ExternalProjectSyncOperation,
  ExternalProjectSyncSchema,
  ExternalProjectSyncSnapshot,
  Json,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';

type AdminDb = TypedSupabaseClient;

type RawExternalProjectEntry = ExternalProjectEntry & {
  source_adapter?: string | null;
  stable_source_id?: string | null;
};

type RawExternalProjectBlock = ExternalProjectBlock & {
  stable_source_id?: string | null;
};

type RawExternalProjectAsset = ExternalProjectAsset & {
  stable_source_id?: string | null;
};

type RawStudioData = Omit<
  ExternalProjectStudioData,
  'assets' | 'blocks' | 'entries'
> & {
  assets: RawExternalProjectAsset[];
  blocks: RawExternalProjectBlock[];
  entries: RawExternalProjectEntry[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function getAdminClient(db?: AdminDb) {
  if (db) {
    return db;
  }

  const { createAdminClient } = await import('@tuturuuu/supabase/next/server');

  return (await createAdminClient()) as TypedSupabaseClient;
}

async function getStudioData(workspaceId: string, db: AdminDb) {
  const { getWorkspaceExternalProjectStudioData } = await import('./store');
  return (await getWorkspaceExternalProjectStudioData(
    workspaceId,
    db
  )) as RawStudioData;
}

async function deleteSyncedEntry({
  db,
  entryId,
  workspaceId,
}: {
  db: AdminDb;
  entryId: string;
  workspaceId: string;
}) {
  const { deleteWorkspaceExternalProjectEntry } = await import('./store');
  return deleteWorkspaceExternalProjectEntry(
    entryId,
    {
      workspaceId,
    },
    db
  );
}

function asJsonObject(value: unknown): Json {
  return asRecord(value) as Json;
}

function asSyncSchema(value: unknown): ExternalProjectSyncSchema | null {
  const record = asRecord(value);
  return Array.isArray(record.collections)
    ? (record as ExternalProjectSyncSchema)
    : null;
}

function stableEntryKey(
  entry: Pick<
    ExternalProjectSyncEntry,
    'collectionSlug' | 'slug' | 'stableSourceId'
  >
) {
  return (
    entry.stableSourceId?.trim() || `${entry.collectionSlug}/${entry.slug}`
  );
}

function stableBlockKey(entryKey: string, block: ExternalProjectSyncBlock) {
  return (
    block.stableSourceId?.trim() || `${entryKey}/blocks/${block.sortOrder ?? 0}`
  );
}

function stableAssetKey(entryKey: string, asset: ExternalProjectSyncAsset) {
  return (
    asset.stableSourceId?.trim() || `${entryKey}/assets/${asset.sortOrder ?? 0}`
  );
}

function normalizeCollectionSchema(
  value: ExternalProjectSyncCollectionSchema
): ExternalProjectSyncCollectionSchema {
  return {
    assetTypes: value.assetTypes ?? [],
    blockTypes: value.blockTypes ?? [],
    collection_type: value.collection_type,
    config: asRecord(value.config),
    description: value.description ?? null,
    metadataFields: value.metadataFields ?? [],
    profileFields: value.profileFields ?? [],
    slug: value.slug,
    title: value.title,
  };
}

export function normalizeExternalProjectSyncManifest(
  value: ExternalProjectSyncManifest
): ExternalProjectSyncManifest {
  return {
    adapter: value.adapter,
    canonicalProjectId: value.canonicalProjectId ?? null,
    content: {
      entries: (value.content?.entries ?? []).map((entry) => ({
        assets: (entry.assets ?? []).map((asset, index) => ({
          altText: asset.altText ?? null,
          assetType: asset.assetType,
          blockStableSourceId: asset.blockStableSourceId ?? null,
          metadata: asRecord(asset.metadata),
          sortOrder: asset.sortOrder ?? index,
          sourceUrl: asset.sourceUrl ?? null,
          stableSourceId: asset.stableSourceId ?? null,
          storagePath: asset.storagePath ?? null,
        })),
        blocks: (entry.blocks ?? []).map((block, index) => ({
          blockType: block.blockType,
          content: asRecord(block.content),
          sortOrder: block.sortOrder ?? index,
          stableSourceId: block.stableSourceId ?? null,
          title: block.title ?? null,
        })),
        collectionSlug: entry.collectionSlug,
        delete: entry.delete === true,
        metadata: asRecord(entry.metadata),
        profileData: asRecord(entry.profileData),
        scheduledFor: entry.scheduledFor ?? null,
        slug: entry.slug,
        stableSourceId: entry.stableSourceId ?? null,
        status: entry.status ?? 'draft',
        subtitle: entry.subtitle ?? null,
        summary: entry.summary ?? null,
        title: entry.title,
      })),
    },
    schema: {
      collections: (value.schema?.collections ?? []).map(
        normalizeCollectionSchema
      ),
      metadataFields: value.schema?.metadataFields ?? [],
      profileFields: value.schema?.profileFields ?? [],
    },
    version: 1,
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function valuesDiffer(left: unknown, right: unknown) {
  return stableStringify(left) !== stableStringify(right);
}

function comparableEntry(entry: ExternalProjectSyncEntry) {
  return {
    assets: (entry.assets ?? []).map((asset) => ({
      altText: asset.altText ?? null,
      assetType: asset.assetType,
      blockStableSourceId: asset.blockStableSourceId ?? null,
      metadata: asRecord(asset.metadata),
      sortOrder: asset.sortOrder ?? 0,
      sourceUrl: asset.sourceUrl ?? null,
      stableSourceId: asset.stableSourceId ?? null,
      storagePath: asset.storagePath ?? null,
    })),
    blocks: (entry.blocks ?? []).map((block) => ({
      blockType: block.blockType,
      content: asRecord(block.content),
      sortOrder: block.sortOrder ?? 0,
      stableSourceId: block.stableSourceId ?? null,
      title: block.title ?? null,
    })),
    collectionSlug: entry.collectionSlug,
    metadata: asRecord(entry.metadata),
    profileData: asRecord(entry.profileData),
    scheduledFor: entry.scheduledFor ?? null,
    slug: entry.slug,
    stableSourceId: entry.stableSourceId ?? null,
    status: entry.status ?? 'draft',
    subtitle: entry.subtitle ?? null,
    summary: entry.summary ?? null,
    title: entry.title,
  };
}

function summarizeOperations(operations: ExternalProjectSyncOperation[]) {
  const summary = {
    archive: 0,
    create: 0,
    delete: 0,
    noop: 0,
    update: 0,
  } satisfies Record<ExternalProjectSyncAction, number>;

  for (const operation of operations) {
    summary[operation.action] += 1;
  }

  return summary;
}

export function buildExternalProjectSyncDiff(
  snapshot: ExternalProjectSyncSnapshot,
  manifestInput: ExternalProjectSyncManifest
): ExternalProjectSyncDiff {
  const manifest = normalizeExternalProjectSyncManifest(manifestInput);
  const operations: ExternalProjectSyncOperation[] = [];
  const snapshotSchema = {
    ...snapshot.schema,
    collections: (snapshot.schema?.collections ?? []).map(
      normalizeCollectionSchema
    ),
    metadataFields: snapshot.schema?.metadataFields ?? [],
    profileFields: snapshot.schema?.profileFields ?? [],
  } satisfies ExternalProjectSyncSchema;

  if (valuesDiffer(snapshotSchema, manifest.schema)) {
    const removedFieldKeys = getRemovedSchemaFieldKeys(
      snapshotSchema,
      manifest.schema
    );

    operations.push({
      action: 'update',
      after: manifest.schema as unknown as Record<string, unknown>,
      before: snapshotSchema as unknown as Record<string, unknown>,
      destructive: removedFieldKeys.length > 0,
      entity: 'schema',
      manifestKey: 'schema',
      reason:
        removedFieldKeys.length > 0
          ? `Schema removes ${removedFieldKeys.length} field definition${removedFieldKeys.length === 1 ? '' : 's'}`
          : 'Schema differs from platform snapshot',
    });
  }

  const snapshotCollections = new Map(
    snapshotSchema.collections.map((collection) => [
      collection.slug,
      collection,
    ])
  );

  for (const collection of manifest.schema.collections) {
    const current = snapshotCollections.get(collection.slug);
    const action = current
      ? valuesDiffer(current, collection)
        ? 'update'
        : 'noop'
      : 'create';

    if (action === 'noop') {
      continue;
    }

    operations.push({
      action,
      after: collection as unknown as Record<string, unknown>,
      before: (current as unknown as Record<string, unknown>) ?? null,
      destructive: false,
      entity: 'collection',
      manifestKey: collection.slug,
      reason: current
        ? 'Collection schema compared by slug'
        : 'Collection missing on platform',
    });
  }

  const snapshotEntries = new Map(
    snapshot.content.entries.map((entry) => [stableEntryKey(entry), entry])
  );
  const manifestEntries = new Map(
    manifest.content.entries.map((entry) => [stableEntryKey(entry), entry])
  );

  for (const [entryKey, entry] of manifestEntries) {
    const current = snapshotEntries.get(entryKey);

    if (entry.delete) {
      if (current) {
        operations.push({
          action: 'delete',
          after: null,
          before: comparableEntry(current),
          destructive: true,
          entity: 'entry',
          manifestKey: entryKey,
          platformId: current.id ?? null,
          reason: 'Manifest explicitly marks entry for deletion',
        });
      }
      continue;
    }

    if (!current) {
      operations.push({
        action: 'create',
        after: comparableEntry(entry),
        before: null,
        destructive: false,
        entity: 'entry',
        manifestKey: entryKey,
        reason: 'Manifest entry missing on platform',
      });
      continue;
    }

    const action = valuesDiffer(
      comparableEntry(current),
      comparableEntry(entry)
    )
      ? 'update'
      : 'noop';

    if (action === 'noop') {
      continue;
    }

    operations.push({
      action,
      after: comparableEntry(entry),
      before: comparableEntry(current),
      destructive: false,
      entity: 'entry',
      manifestKey: entryKey,
      platformId: current.id ?? null,
      reason:
        action === 'update'
          ? 'Manifest entry differs from platform entry'
          : 'Manifest entry matches platform entry',
    });
  }

  for (const [entryKey, current] of snapshotEntries) {
    if (manifestEntries.has(entryKey) || current.status === 'archived') {
      continue;
    }

    operations.push({
      action: 'archive',
      after: {
        status: 'archived',
      },
      before: comparableEntry(current),
      destructive: false,
      entity: 'entry',
      manifestKey: entryKey,
      platformId: current.id ?? null,
      reason: 'Platform entry is not present in manifest',
    });
  }

  return {
    hasDestructiveOperations: operations.some(
      (operation) => operation.destructive
    ),
    operations,
    summary: summarizeOperations(operations),
  };
}

function getSchemaFromBinding(binding: WorkspaceExternalProjectBinding) {
  const deliveryProfile = asRecord(binding.canonical_project?.delivery_profile);
  return (
    asSyncSchema(deliveryProfile.schema) ?? {
      collections: [],
    }
  );
}

function getCollectionSchema(
  collection: ExternalProjectCollection,
  canonicalSchema: ExternalProjectSyncSchema
): ExternalProjectSyncCollectionSchema {
  const config = asRecord(collection.config);
  const configSchema = asSyncSchema({
    collections: [config.schema],
  })?.collections[0];
  const canonicalCollectionSchema = canonicalSchema.collections.find(
    (item) => item.slug === collection.slug
  );

  return normalizeCollectionSchema(
    canonicalCollectionSchema ??
      configSchema ?? {
        collection_type: collection.collection_type,
        config,
        description: collection.description,
        slug: collection.slug,
        title: collection.title,
      }
  );
}

function fieldDefinitionToSyncField(
  definition: ExternalProjectFieldDefinition
): ExternalProjectSyncField {
  return {
    defaultValue: definition.default_value ?? undefined,
    description: definition.description,
    key: definition.key,
    label: definition.label,
    options: definition.options,
    required: definition.is_required,
    type: definition.field_type,
  };
}

function getFieldsForScope(
  fieldDefinitions: ExternalProjectFieldDefinition[],
  collectionId: string | null,
  fieldScope: ExternalProjectFieldDefinition['field_scope']
) {
  return fieldDefinitions
    .filter(
      (definition) =>
        definition.is_enabled &&
        definition.collection_id === collectionId &&
        definition.field_scope === fieldScope
    )
    .sort((left, right) => {
      const orderDiff = left.sort_order - right.sort_order;
      return orderDiff === 0
        ? left.created_at.localeCompare(right.created_at)
        : orderDiff;
    })
    .map(fieldDefinitionToSyncField);
}

function withFieldDefinitionsFromDatabase({
  collections,
  fieldDefinitions,
  schema,
}: {
  collections: ExternalProjectCollection[];
  fieldDefinitions: ExternalProjectFieldDefinition[];
  schema: ExternalProjectSyncSchema;
}): ExternalProjectSyncSchema {
  const collectionBySlug = new Map(
    collections.map((collection) => [collection.slug, collection])
  );
  const globalProfileFields = getFieldsForScope(
    fieldDefinitions,
    null,
    'profile_data'
  );
  const globalMetadataFields = getFieldsForScope(
    fieldDefinitions,
    null,
    'metadata'
  );

  return {
    ...schema,
    collections: schema.collections.map((collection) => {
      const studioCollection = collectionBySlug.get(collection.slug);
      if (!studioCollection) {
        return collection;
      }

      const profileFields = getFieldsForScope(
        fieldDefinitions,
        studioCollection.id,
        'profile_data'
      );
      const metadataFields = getFieldsForScope(
        fieldDefinitions,
        studioCollection.id,
        'metadata'
      );

      return {
        ...collection,
        metadataFields:
          metadataFields.length > 0
            ? metadataFields
            : (collection.metadataFields ?? []),
        profileFields:
          profileFields.length > 0
            ? profileFields
            : (collection.profileFields ?? []),
      };
    }),
    metadataFields:
      globalMetadataFields.length > 0
        ? globalMetadataFields
        : (schema.metadataFields ?? []),
    profileFields:
      globalProfileFields.length > 0
        ? globalProfileFields
        : (schema.profileFields ?? []),
  };
}

function schemaFieldKeys(schema: ExternalProjectSyncSchema) {
  const keys = new Set<string>();
  for (const field of schema.profileFields ?? []) {
    keys.add(`global:profile_data:${field.key}`);
  }
  for (const field of schema.metadataFields ?? []) {
    keys.add(`global:metadata:${field.key}`);
  }
  for (const collection of schema.collections) {
    for (const field of collection.profileFields ?? []) {
      keys.add(`${collection.slug}:profile_data:${field.key}`);
    }
    for (const field of collection.metadataFields ?? []) {
      keys.add(`${collection.slug}:metadata:${field.key}`);
    }
  }
  return keys;
}

function getRemovedSchemaFieldKeys(
  snapshotSchema: ExternalProjectSyncSchema,
  manifestSchema: ExternalProjectSyncSchema
) {
  const manifestKeys = schemaFieldKeys(manifestSchema);
  return [...schemaFieldKeys(snapshotSchema)].filter(
    (key) => !manifestKeys.has(key)
  );
}

export function buildExternalProjectSyncSnapshot({
  binding,
  generatedAt = new Date().toISOString(),
  studio,
  workspaceId,
}: {
  binding: WorkspaceExternalProjectBinding;
  generatedAt?: string;
  studio: RawStudioData;
  workspaceId: string;
}): ExternalProjectSyncSnapshot {
  const canonicalSchema = getSchemaFromBinding(binding);
  const collectionsById = new Map(
    studio.collections.map((collection) => [collection.id, collection])
  );
  const blocksById = new Map(studio.blocks.map((block) => [block.id, block]));
  const blocksByEntryId = new Map<string, RawExternalProjectBlock[]>();
  const assetsByEntryId = new Map<string, RawExternalProjectAsset[]>();

  for (const block of studio.blocks) {
    const list = blocksByEntryId.get(block.entry_id) ?? [];
    list.push(block);
    blocksByEntryId.set(block.entry_id, list);
  }

  for (const asset of studio.assets) {
    const assetEntryId =
      asset.entry_id ??
      (asset.block_id
        ? (blocksById.get(asset.block_id)?.entry_id ?? null)
        : null);

    if (!assetEntryId) {
      continue;
    }

    const list = assetsByEntryId.get(assetEntryId) ?? [];
    list.push(asset);
    assetsByEntryId.set(assetEntryId, list);
  }

  const schema = {
    ...canonicalSchema,
    collections: studio.collections.map((collection) =>
      getCollectionSchema(collection, canonicalSchema)
    ),
  } satisfies ExternalProjectSyncSchema;
  const dbBackedSchema = withFieldDefinitionsFromDatabase({
    collections: studio.collections,
    fieldDefinitions: studio.fieldDefinitions ?? [],
    schema,
  });

  return {
    adapter: binding.adapter ?? 'yoola',
    canonicalProjectId: binding.canonical_id,
    content: {
      entries: studio.entries.map((entry) => {
        const collection = collectionsById.get(entry.collection_id);
        const collectionSlug = collection?.slug ?? entry.collection_id;
        const entryKey =
          entry.stable_source_id ?? `${collectionSlug}/${entry.slug}`;

        return {
          assets: (assetsByEntryId.get(entry.id) ?? [])
            .sort((left, right) => left.sort_order - right.sort_order)
            .map((asset) => ({
              altText: asset.alt_text,
              assetType: asset.asset_type,
              blockStableSourceId: asset.block_id
                ? (blocksById.get(asset.block_id)?.stable_source_id ?? null)
                : null,
              id: asset.id,
              metadata: asRecord(asset.metadata),
              sortOrder: asset.sort_order,
              sourceUrl: asset.source_url,
              stableSourceId: asset.stable_source_id ?? null,
              storagePath: asset.storage_path,
            })),
          blocks: (blocksByEntryId.get(entry.id) ?? [])
            .sort((left, right) => left.sort_order - right.sort_order)
            .map((block) => ({
              blockType: block.block_type,
              content: asRecord(block.content),
              id: block.id,
              sortOrder: block.sort_order,
              stableSourceId: block.stable_source_id ?? null,
              title: block.title,
            })),
          collectionSlug,
          id: entry.id,
          metadata: asRecord(entry.metadata),
          profileData: asRecord(entry.profile_data),
          publishedAt: entry.published_at,
          scheduledFor: entry.scheduled_for,
          slug: entry.slug,
          stableSourceId: entry.stable_source_id ?? entryKey,
          status: entry.status,
          subtitle: entry.subtitle,
          summary: entry.summary,
          title: entry.title,
        };
      }),
    },
    generatedAt,
    schema: dbBackedSchema,
    version: 1,
    workspaceId,
  };
}

export async function getWorkspaceExternalProjectSyncSnapshot(
  {
    binding,
    workspaceId,
  }: {
    binding: WorkspaceExternalProjectBinding;
    workspaceId: string;
  },
  db?: AdminDb
) {
  const admin = await getAdminClient(db);
  const studio = await getStudioData(workspaceId, admin);

  return buildExternalProjectSyncSnapshot({
    binding,
    studio,
    workspaceId,
  });
}

async function updateCanonicalSchema({
  actorId,
  binding,
  db,
  schema,
}: {
  actorId: string;
  binding: WorkspaceExternalProjectBinding;
  db: AdminDb;
  schema: ExternalProjectSyncSchema;
}) {
  if (!binding.canonical_id) {
    return;
  }

  const deliveryProfile = {
    ...asRecord(binding.canonical_project?.delivery_profile),
    schema,
  };

  const { error } = await db
    .from('canonical_external_projects')
    .update({
      delivery_profile: deliveryProfile as Json,
      updated_by: actorId,
    })
    .eq('id', binding.canonical_id);

  if (error) {
    throw new Error(error.message);
  }
}

async function upsertCollections({
  actorId,
  collections,
  db,
  workspaceId,
}: {
  actorId: string;
  collections: ExternalProjectSyncCollectionSchema[];
  db: AdminDb;
  workspaceId: string;
}) {
  const { data: existing, error } = await db
    .from('workspace_external_project_collections')
    .select('*')
    .eq('ws_id', workspaceId);

  if (error) {
    throw new Error(error.message);
  }

  const bySlug = new Map(
    (existing ?? []).map((collection) => [collection.slug, collection])
  );
  const result = new Map<string, ExternalProjectCollection>();

  for (const collection of collections) {
    const current = bySlug.get(collection.slug);
    const config = {
      ...asRecord(collection.config),
      schema: collection,
    };

    if (current) {
      const { data, error: updateError } = await db
        .from('workspace_external_project_collections')
        .update({
          collection_type: collection.collection_type,
          config: config as Json,
          description: collection.description ?? null,
          title: collection.title,
          updated_by: actorId,
        })
        .eq('id', current.id)
        .select('*')
        .single();

      if (updateError) {
        throw new Error(updateError.message);
      }

      result.set(collection.slug, data);
      continue;
    }

    const { data, error: insertError } = await db
      .from('workspace_external_project_collections')
      .insert({
        collection_type: collection.collection_type,
        config: config as Json,
        created_by: actorId,
        description: collection.description ?? null,
        slug: collection.slug,
        title: collection.title,
        updated_by: actorId,
        ws_id: workspaceId,
      })
      .select('*')
      .single();

    if (insertError) {
      throw new Error(insertError.message);
    }

    result.set(collection.slug, data);
  }

  return result;
}

function buildExistingEntryMaps(studio: RawStudioData) {
  const collectionById = new Map(
    studio.collections.map((collection) => [collection.id, collection])
  );
  const byKey = new Map<string, RawExternalProjectEntry>();

  for (const entry of studio.entries) {
    const collection = collectionById.get(entry.collection_id);
    const key =
      entry.stable_source_id ??
      `${collection?.slug ?? entry.collection_id}/${entry.slug}`;
    byKey.set(key, entry);
  }

  return byKey;
}

async function upsertEntry({
  actorId,
  adapter,
  collectionId,
  db,
  entry,
  existing,
  workspaceId,
}: {
  actorId: string;
  adapter: WorkspaceExternalProjectBinding['adapter'];
  collectionId: string;
  db: AdminDb;
  entry: ExternalProjectSyncEntry;
  existing?: RawExternalProjectEntry;
  workspaceId: string;
}) {
  const values = {
    collection_id: collectionId,
    metadata: asJsonObject(entry.metadata),
    profile_data: asJsonObject(entry.profileData),
    scheduled_for: entry.scheduledFor ?? null,
    slug: entry.slug,
    source_adapter: entry.stableSourceId ? adapter : null,
    stable_source_id: entry.stableSourceId ?? null,
    status: entry.status ?? 'draft',
    subtitle: entry.subtitle ?? null,
    summary: entry.summary ?? null,
    title: entry.title,
    updated_by: actorId,
    ws_id: workspaceId,
  };

  if (existing) {
    const { data, error } = await db
      .from('workspace_external_project_entries')
      .update(values)
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data as RawExternalProjectEntry;
  }

  const { data, error } = await db
    .from('workspace_external_project_entries')
    .insert({
      ...values,
      created_by: actorId,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as RawExternalProjectEntry;
}

async function upsertBlocks({
  actorId,
  blocks,
  db,
  entryId,
  existingBlocks,
  workspaceId,
}: {
  actorId: string;
  blocks: ExternalProjectSyncBlock[];
  db: AdminDb;
  entryId: string;
  existingBlocks: RawExternalProjectBlock[];
  workspaceId: string;
}) {
  const byKey = new Map(
    existingBlocks.map((block) => [
      block.stable_source_id ?? `${entryId}/blocks/${block.sort_order}`,
      block,
    ])
  );
  const blockIdByStableSourceId = new Map<string, string>();

  for (const [index, block] of blocks.entries()) {
    const key = stableBlockKey(entryId, {
      ...block,
      sortOrder: block.sortOrder ?? index,
    });
    const current = byKey.get(key);
    const values = {
      block_type: block.blockType,
      content: asJsonObject(block.content),
      entry_id: entryId,
      sort_order: block.sortOrder ?? index,
      stable_source_id: block.stableSourceId ?? null,
      title: block.title ?? null,
      updated_by: actorId,
      ws_id: workspaceId,
    };

    const query = current
      ? db
          .from('workspace_external_project_blocks')
          .update(values)
          .eq('id', current.id)
          .select('*')
          .single()
      : db
          .from('workspace_external_project_blocks')
          .insert({
            ...values,
            created_by: actorId,
          })
          .select('*')
          .single();

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    if (block.stableSourceId) {
      blockIdByStableSourceId.set(block.stableSourceId, data.id);
    }
  }

  return blockIdByStableSourceId;
}

async function upsertAssets({
  actorId,
  assets,
  blockIdByStableSourceId,
  db,
  entryId,
  existingAssets,
  workspaceId,
}: {
  actorId: string;
  assets: ExternalProjectSyncAsset[];
  blockIdByStableSourceId: Map<string, string>;
  db: AdminDb;
  entryId: string;
  existingAssets: RawExternalProjectAsset[];
  workspaceId: string;
}) {
  const byKey = new Map(
    existingAssets.map((asset) => [
      asset.stable_source_id ?? `${entryId}/assets/${asset.sort_order}`,
      asset,
    ])
  );

  for (const [index, asset] of assets.entries()) {
    const key = stableAssetKey(entryId, {
      ...asset,
      sortOrder: asset.sortOrder ?? index,
    });
    const current = byKey.get(key);
    const blockId = asset.blockStableSourceId
      ? (blockIdByStableSourceId.get(asset.blockStableSourceId) ?? null)
      : null;
    const values = {
      alt_text: asset.altText ?? null,
      asset_type: asset.assetType,
      block_id: blockId,
      entry_id: blockId ? null : entryId,
      metadata: asJsonObject(asset.metadata),
      sort_order: asset.sortOrder ?? index,
      source_url: asset.sourceUrl ?? null,
      stable_source_id: asset.stableSourceId ?? null,
      storage_path: asset.storagePath ?? null,
      updated_by: actorId,
      ws_id: workspaceId,
    };

    const query = current
      ? db
          .from('workspace_external_project_assets')
          .update(values)
          .eq('id', current.id)
          .select('*')
          .single()
      : db
          .from('workspace_external_project_assets')
          .insert({
            ...values,
            created_by: actorId,
          })
          .select('*')
          .single();

    const { error } = await query;

    if (error) {
      throw new Error(error.message);
    }
  }
}

export async function applyWorkspaceExternalProjectSyncManifest(
  {
    actorId,
    binding,
    force = false,
    manifest: manifestInput,
    workspaceId,
  }: {
    actorId: string;
    binding: WorkspaceExternalProjectBinding;
    force?: boolean;
    manifest: ExternalProjectSyncManifest;
    workspaceId: string;
  },
  db?: AdminDb
): Promise<ExternalProjectSyncApplyResult> {
  const admin = await getAdminClient(db);
  const manifest = normalizeExternalProjectSyncManifest(manifestInput);
  const studio = await getStudioData(workspaceId, admin);
  const snapshot = buildExternalProjectSyncSnapshot({
    binding,
    studio,
    workspaceId,
  });
  const diff = buildExternalProjectSyncDiff(snapshot, manifest);

  if (diff.hasDestructiveOperations && !force) {
    throw new Error(
      'External project sync contains destructive operations. Re-run with force to apply.'
    );
  }

  await updateCanonicalSchema({
    actorId,
    binding,
    db: admin,
    schema: manifest.schema,
  });

  const collectionBySlug = await upsertCollections({
    actorId,
    collections: manifest.schema.collections,
    db: admin,
    workspaceId,
  });

  const { upsertWorkspaceExternalProjectFieldDefinitionsFromSchema } =
    await import('./store');

  await upsertWorkspaceExternalProjectFieldDefinitionsFromSchema(
    {
      actorId,
      collectionBySlug,
      deleteMissing: force === true,
      schema: manifest.schema,
      workspaceId,
    },
    admin
  );

  const existingEntries = buildExistingEntryMaps(studio);
  const appliedEntryKeys = new Set<string>();
  const existingBlocksByEntryId = new Map<string, RawExternalProjectBlock[]>();
  const existingAssetsByEntryId = new Map<string, RawExternalProjectAsset[]>();
  const existingBlockById = new Map(
    studio.blocks.map((block) => [block.id, block])
  );

  for (const block of studio.blocks) {
    const list = existingBlocksByEntryId.get(block.entry_id) ?? [];
    list.push(block);
    existingBlocksByEntryId.set(block.entry_id, list);
  }

  for (const asset of studio.assets) {
    const assetEntryId =
      asset.entry_id ??
      (asset.block_id
        ? (existingBlockById.get(asset.block_id)?.entry_id ?? null)
        : null);

    if (!assetEntryId) {
      continue;
    }

    const list = existingAssetsByEntryId.get(assetEntryId) ?? [];
    list.push(asset);
    existingAssetsByEntryId.set(assetEntryId, list);
  }

  for (const entry of manifest.content.entries) {
    const entryKey = stableEntryKey(entry);
    const existing = existingEntries.get(entryKey);

    if (entry.delete) {
      if (existing && force) {
        await deleteSyncedEntry({
          db: admin,
          entryId: existing.id,
          workspaceId,
        });
      }
      appliedEntryKeys.add(entryKey);
      continue;
    }

    const collection = collectionBySlug.get(entry.collectionSlug);
    if (!collection) {
      throw new Error(`Missing synced collection for ${entry.collectionSlug}`);
    }

    const syncedEntry = await upsertEntry({
      actorId,
      adapter: binding.adapter,
      collectionId: collection.id,
      db: admin,
      entry,
      existing,
      workspaceId,
    });
    const blockIdByStableSourceId = await upsertBlocks({
      actorId,
      blocks: entry.blocks ?? [],
      db: admin,
      entryId: syncedEntry.id,
      existingBlocks: existingBlocksByEntryId.get(syncedEntry.id) ?? [],
      workspaceId,
    });

    await upsertAssets({
      actorId,
      assets: entry.assets ?? [],
      blockIdByStableSourceId,
      db: admin,
      entryId: syncedEntry.id,
      existingAssets: existingAssetsByEntryId.get(syncedEntry.id) ?? [],
      workspaceId,
    });
    appliedEntryKeys.add(entryKey);
  }

  for (const [entryKey, existing] of existingEntries) {
    if (appliedEntryKeys.has(entryKey) || existing.status === 'archived') {
      continue;
    }

    const { error } = await admin
      .from('workspace_external_project_entries')
      .update({
        status: 'archived',
        updated_by: actorId,
      })
      .eq('id', existing.id);

    if (error) {
      throw new Error(error.message);
    }
  }

  return {
    applied: true,
    diff,
    snapshot: await getWorkspaceExternalProjectSyncSnapshot(
      {
        binding,
        workspaceId,
      },
      admin
    ),
  };
}
