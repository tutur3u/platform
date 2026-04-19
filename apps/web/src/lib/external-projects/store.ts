import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type {
  CanonicalExternalProject,
  ExternalProjectAttentionItem,
  ExternalProjectBulkUpdatePayload,
  ExternalProjectCollection,
  ExternalProjectDeliveryCollection,
  ExternalProjectDeliveryPayload,
  ExternalProjectEntry,
  ExternalProjectEntryStatus,
  ExternalProjectImportReport,
  ExternalProjectLoadingData,
  ExternalProjectStudioData,
  ExternalProjectSummary,
  Json,
  WorkspaceExternalProjectBinding,
  YoolaExternalProjectArtworkLoadingItem,
  YoolaExternalProjectLoreCapsuleLoadingItem,
} from '@tuturuuu/types';
import { externalProjectAdapterFixtures } from './fixtures';

type AdminDb = TypedSupabaseClient;
type JsonObject = { [key: string]: Json | undefined };

function asJsonObject(
  value: Json | Record<string, unknown> | null | undefined
): JsonObject {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonObject;
  }

  return {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatAttentionDate(value: string | null) {
  if (!value) {
    return 'No schedule';
  }

  return new Date(value).toLocaleString('en-US', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  });
}

function findMarkdownBlockMarkdown(entry: {
  blocks: Array<{
    block_type: string;
    content: Json;
  }>;
}) {
  const markdownBlock = entry.blocks.find(
    (block) =>
      block.block_type === 'markdown' &&
      typeof asJsonObject(block.content).markdown === 'string'
  );

  return asString(asJsonObject(markdownBlock?.content).markdown);
}

function buildDeliveryAssetUrl(
  workspaceId: string,
  asset: {
    id: string;
    source_url: string | null;
  }
) {
  if (asset.source_url) {
    return asset.source_url;
  }

  return `/api/v1/workspaces/${workspaceId}/external-projects/assets/${asset.id}`;
}

function buildYoolaLoadingData(
  collections: ExternalProjectDeliveryCollection[]
): ExternalProjectLoadingData {
  const artworksCollection =
    collections.find((collection) => collection.slug === 'artworks') ?? null;
  const loreCollection =
    collections.find((collection) => collection.slug === 'lore-capsules') ??
    null;
  const singletonCollection =
    collections.find(
      (collection) => collection.slug === 'singleton-sections'
    ) ?? null;

  const artworks = (artworksCollection?.entries ?? []).map((entry) => {
    const profile = asJsonObject(entry.profile_data);
    const leadAsset = entry.assets.find(
      (asset) => asset.asset_type === 'image'
    );

    return {
      altText: leadAsset?.alt_text ?? null,
      assetId: leadAsset?.id ?? null,
      assetUrl: leadAsset?.assetUrl ?? null,
      category: asString(profile.category),
      entryId: entry.id,
      height: asNullableNumber(profile.height),
      label: asString(profile.label),
      note: asString(profile.note),
      orientation: asString(profile.orientation),
      rarity: asString(profile.rarity),
      slug: entry.slug,
      summary: entry.summary,
      title: entry.title,
      width: asNullableNumber(profile.width),
      year: asString(profile.year),
    } satisfies YoolaExternalProjectArtworkLoadingItem;
  });

  const artworkBySlug = new Map<
    string,
    YoolaExternalProjectArtworkLoadingItem
  >();
  for (const artwork of artworks) {
    artworkBySlug.set(artwork.slug, artwork);
  }

  const loreCapsules = (loreCollection?.entries ?? []).map((entry) => {
    const profile = asJsonObject(entry.profile_data);
    const artworkEntry = asString(profile.artworkSlug)
      ? (artworkBySlug.get(asString(profile.artworkSlug) as string) ?? null)
      : null;

    return {
      artworkAssetUrl: artworkEntry?.assetUrl ?? null,
      artworkEntryId: artworkEntry?.entryId ?? null,
      channel: asString(profile.channel),
      date: asString(profile.date),
      entryId: entry.id,
      excerptMarkdown: findMarkdownBlockMarkdown(entry),
      slug: entry.slug,
      status: asString(profile.status),
      summary: entry.summary,
      tags: asStringArray(profile.tags),
      teaser: asString(profile.teaser),
      title: entry.title,
    } satisfies YoolaExternalProjectLoreCapsuleLoadingItem;
  });

  const artworksByCategory = artworks.reduce<
    Record<string, YoolaExternalProjectArtworkLoadingItem[]>
  >((accumulator, artwork) => {
    const category = artwork.category ?? 'UNCATEGORIZED';
    accumulator[category] ??= [];
    accumulator[category].push(artwork);
    return accumulator;
  }, {});

  const singletonSections = Object.fromEntries(
    (singletonCollection?.entries ?? []).map((entry) => [
      entry.slug,
      {
        bodyMarkdown: findMarkdownBlockMarkdown(entry),
        entryId: entry.id,
        slug: entry.slug,
        summary: entry.summary,
        title: entry.title,
      },
    ])
  );

  return {
    adapter: 'yoola',
    artworkCategories: Object.keys(artworksByCategory),
    artworks,
    artworksByCategory,
    featuredArtwork: artworks[0] ?? null,
    loreCapsules,
    singletonSections,
  };
}

function buildExternalProjectLoadingData(
  adapter: WorkspaceExternalProjectBinding['adapter'],
  collections: ExternalProjectDeliveryCollection[]
): ExternalProjectLoadingData | null {
  if (!adapter) {
    return null;
  }

  if (adapter === 'yoola') {
    return buildYoolaLoadingData(collections);
  }

  return {
    adapter,
    sections: Object.fromEntries(
      collections.map((collection) => [
        collection.slug,
        {
          collectionType: collection.collection_type,
          entryCount: collection.entries.length,
          title: collection.title,
        },
      ])
    ),
  };
}

async function listWorkspaceExternalProjectBlocksByEntryIds(
  workspaceId: string,
  entryIds: string[],
  db: AdminDb
) {
  if (entryIds.length === 0) {
    return [];
  }

  const { data, error } = await db
    .from('workspace_external_project_blocks')
    .select('*')
    .eq('ws_id', workspaceId)
    .in('entry_id', entryIds)
    .order('sort_order', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function listWorkspaceExternalProjectAssetsByEntryIds(
  workspaceId: string,
  entryIds: string[],
  db: AdminDb
) {
  if (entryIds.length === 0) {
    return [];
  }

  const { data, error } = await db
    .from('workspace_external_project_assets')
    .select('*')
    .eq('ws_id', workspaceId)
    .in('entry_id', entryIds)
    .order('sort_order', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
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

  return data;
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

  return data;
}

export async function listWorkspaceExternalProjectCollections(
  workspaceId: string,
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { data, error } = await admin
    .from('workspace_external_project_collections')
    .select('*')
    .eq('ws_id', workspaceId)
    .order('title', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function listWorkspaceExternalProjectEntries(
  workspaceId: string,
  options: {
    collectionId?: string;
    includeDrafts?: boolean;
  } = {},
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  let query = admin
    .from('workspace_external_project_entries')
    .select('*')
    .eq('ws_id', workspaceId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (options.collectionId) {
    query = query.eq('collection_id', options.collectionId);
  }

  if (!options.includeDrafts) {
    query = query.eq('status', 'published');
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getWorkspaceExternalProjectStudioData(
  workspaceId: string,
  db?: AdminDb
): Promise<ExternalProjectStudioData> {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const [collections, entries, importJobs, publishEvents] = await Promise.all([
    listWorkspaceExternalProjectCollections(workspaceId, admin),
    listWorkspaceExternalProjectEntries(
      workspaceId,
      { includeDrafts: true },
      admin
    ),
    admin
      .from('workspace_external_project_import_jobs')
      .select('*')
      .eq('ws_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data ?? [];
      }),
    admin
      .from('workspace_external_project_publish_events')
      .select('*')
      .eq('ws_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data ?? [];
      }),
  ]);

  const entryIds = entries.map((entry) => entry.id);
  const [blocks, rawAssets] = await Promise.all([
    listWorkspaceExternalProjectBlocksByEntryIds(workspaceId, entryIds, admin),
    listWorkspaceExternalProjectAssetsByEntryIds(workspaceId, entryIds, admin),
  ]);
  const assets = rawAssets.map((asset) => {
    const assetUrl = buildDeliveryAssetUrl(workspaceId, asset);

    return {
      ...asset,
      asset_url: assetUrl,
      preview_url: assetUrl,
    };
  });
  const collectionsPayload: ExternalProjectDeliveryCollection[] =
    collections.map((collection) => ({
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
            })),
          blocks: blocks.filter((block) => block.entry_id === entry.id),
        })),
    }));

  return {
    assets,
    blocks,
    collections,
    entries,
    importJobs,
    loadingData: buildExternalProjectLoadingData(
      entries[0]?.source_adapter ?? null,
      collectionsPayload
    ),
    publishEvents,
  };
}

function buildExternalProjectAttentionItem(
  entry: ExternalProjectEntry,
  collection: ExternalProjectCollection | null,
  detail: string,
  kind: ExternalProjectAttentionItem['kind']
): ExternalProjectAttentionItem {
  return {
    collectionId: entry.collection_id,
    collectionTitle: collection?.title ?? 'Unknown collection',
    detail,
    entryId: entry.id,
    kind,
    scheduledFor: entry.scheduled_for ?? null,
    slug: entry.slug,
    status: entry.status,
    summary: entry.summary,
    title: entry.title,
  };
}

function buildExternalProjectSummary({
  adapter,
  canonicalProjectId,
  studio,
  workspaceId,
}: {
  adapter: WorkspaceExternalProjectBinding['adapter'];
  canonicalProjectId: string | null;
  studio: ExternalProjectStudioData;
  workspaceId: string;
}): ExternalProjectSummary {
  const collectionById = new Map(
    studio.collections.map((collection) => [collection.id, collection])
  );
  const now = new Date();
  const scheduledCutoff = addDays(now, 7);
  const latestImport = studio.importJobs[0]?.created_at ?? null;

  const counts = {
    archived: studio.entries.filter((entry) => entry.status === 'archived')
      .length,
    collections: studio.collections.length,
    drafts: studio.entries.filter((entry) => entry.status === 'draft').length,
    entries: studio.entries.length,
    published: studio.entries.filter((entry) => entry.status === 'published')
      .length,
    scheduled: studio.entries.filter((entry) => entry.status === 'scheduled')
      .length,
  };

  const collections = studio.collections.map((collection) => {
    const collectionEntries = studio.entries.filter(
      (entry) => entry.collection_id === collection.id
    );

    return {
      archivedEntries: collectionEntries.filter(
        (entry) => entry.status === 'archived'
      ).length,
      draftEntries: collectionEntries.filter(
        (entry) => entry.status === 'draft'
      ).length,
      id: collection.id,
      isEnabled: collection.is_enabled,
      publishedEntries: collectionEntries.filter(
        (entry) => entry.status === 'published'
      ).length,
      scheduledEntries: collectionEntries.filter(
        (entry) => entry.status === 'scheduled'
      ).length,
      slug: collection.slug,
      title: collection.title,
      totalEntries: collectionEntries.length,
    };
  });

  const scheduledSoon = studio.entries
    .filter(
      (entry) =>
        entry.status === 'scheduled' &&
        entry.scheduled_for &&
        new Date(entry.scheduled_for) <= scheduledCutoff
    )
    .sort((a, b) =>
      (a.scheduled_for ?? '').localeCompare(b.scheduled_for ?? '')
    )
    .slice(0, 6)
    .map((entry) =>
      buildExternalProjectAttentionItem(
        entry,
        collectionById.get(entry.collection_id) ?? null,
        `Scheduled for ${formatAttentionDate(entry.scheduled_for ?? null)}`,
        'scheduled_soon'
      )
    );

  const draftsMissingMedia = studio.entries
    .filter((entry) => entry.status !== 'archived')
    .filter(
      (entry) =>
        !studio.assets.some(
          (asset) => asset.entry_id === entry.id && asset.asset_type === 'image'
        )
    )
    .slice(0, 6)
    .map((entry) =>
      buildExternalProjectAttentionItem(
        entry,
        collectionById.get(entry.collection_id) ?? null,
        'Missing a primary image asset',
        'missing_media'
      )
    );

  const recentlyImportedUnpublished = studio.entries
    .filter((entry) => entry.status !== 'published')
    .filter((entry) => {
      if (!latestImport) {
        return false;
      }

      return new Date(entry.created_at) >= new Date(latestImport);
    })
    .slice(0, 6)
    .map((entry) =>
      buildExternalProjectAttentionItem(
        entry,
        collectionById.get(entry.collection_id) ?? null,
        'Imported recently but still not published',
        'recently_imported_unpublished'
      )
    );

  const archivedBacklog = studio.entries
    .filter((entry) => entry.status === 'archived')
    .slice(0, 6)
    .map((entry) =>
      buildExternalProjectAttentionItem(
        entry,
        collectionById.get(entry.collection_id) ?? null,
        'Archived and available for recovery or cleanup',
        'archived_backlog'
      )
    );

  return {
    adapter,
    canonicalProjectId,
    collections,
    counts,
    queues: {
      archivedBacklog,
      draftsMissingMedia,
      recentlyImportedUnpublished,
      scheduledSoon,
    },
    recentActivity: {
      importJobs: studio.importJobs.slice(0, 5),
      publishEvents: studio.publishEvents.slice(0, 5),
    },
    workspaceId,
  };
}

export async function getWorkspaceExternalProjectSummary(
  {
    adapter,
    canonicalProjectId,
    workspaceId,
  }: {
    adapter: WorkspaceExternalProjectBinding['adapter'];
    canonicalProjectId: string | null;
    workspaceId: string;
  },
  db?: AdminDb
): Promise<ExternalProjectSummary> {
  const studio = await getWorkspaceExternalProjectStudioData(workspaceId, db);

  return buildExternalProjectSummary({
    adapter,
    canonicalProjectId,
    studio,
    workspaceId,
  });
}

export async function createCanonicalExternalProject(
  payload: {
    adapter: CanonicalExternalProject['adapter'];
    allowed_collections: CanonicalExternalProject['allowed_collections'];
    allowed_features: CanonicalExternalProject['allowed_features'];
    delivery_profile: Json;
    display_name: string;
    id: string;
    is_active: boolean;
    metadata: Json;
    actorId: string;
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
    throw new Error(error.message);
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
    throw new Error(error.message);
  }

  return data;
}

type UpsertCollectionPayload = {
  collection_type: string;
  config: Json;
  description?: string | null;
  slug: string;
  title: string;
  actorId: string;
  workspaceId: string;
};

export async function createWorkspaceExternalProjectCollection(
  payload: UpsertCollectionPayload,
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { actorId, workspaceId, ...values } = payload;
  const { data, error } = await admin
    .from('workspace_external_project_collections')
    .insert({
      ...values,
      created_by: actorId,
      updated_by: actorId,
      ws_id: workspaceId,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateWorkspaceExternalProjectCollection(
  collectionId: string,
  payload: Partial<{
    collection_type: string;
    config: Json;
    description: string | null;
    is_enabled: boolean;
    slug: string;
    title: string;
  }> & {
    actorId: string;
  },
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { actorId, ...values } = payload;
  const { data, error } = await admin
    .from('workspace_external_project_collections')
    .update({
      ...values,
      updated_by: actorId,
    })
    .eq('id', collectionId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deleteWorkspaceExternalProjectCollection(
  collectionId: string,
  payload: {
    workspaceId: string;
  },
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { workspaceId } = payload;

  const { data: relatedEntries, error: relatedEntriesError } = await admin
    .from('workspace_external_project_entries')
    .select('id')
    .eq('ws_id', workspaceId)
    .eq('collection_id', collectionId);

  if (relatedEntriesError) {
    throw new Error(relatedEntriesError.message);
  }

  const relatedEntryIds = (relatedEntries ?? []).map((entry) => entry.id);

  if (relatedEntryIds.length > 0) {
    const { error: deleteAssetsError } = await admin
      .from('workspace_external_project_assets')
      .delete()
      .eq('ws_id', workspaceId)
      .in('entry_id', relatedEntryIds);

    if (deleteAssetsError) {
      throw new Error(deleteAssetsError.message);
    }

    const { error: deleteBlocksError } = await admin
      .from('workspace_external_project_blocks')
      .delete()
      .eq('ws_id', workspaceId)
      .in('entry_id', relatedEntryIds);

    if (deleteBlocksError) {
      throw new Error(deleteBlocksError.message);
    }

    const { error: deleteEntriesError } = await admin
      .from('workspace_external_project_entries')
      .delete()
      .eq('ws_id', workspaceId)
      .eq('collection_id', collectionId);

    if (deleteEntriesError) {
      throw new Error(deleteEntriesError.message);
    }
  }

  const { error } = await admin
    .from('workspace_external_project_collections')
    .delete()
    .eq('ws_id', workspaceId)
    .eq('id', collectionId);

  if (error) {
    throw new Error(error.message);
  }

  return { id: collectionId };
}

type UpsertBlockPayload = {
  block_type: string;
  content: Json;
  entry_id: string;
  sort_order?: number;
  stable_source_id?: string | null;
  title?: string | null;
  actorId: string;
  workspaceId: string;
};

export async function createWorkspaceExternalProjectBlock(
  payload: UpsertBlockPayload,
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { actorId, workspaceId, ...values } = payload;
  const { data, error } = await admin
    .from('workspace_external_project_blocks')
    .insert({
      ...values,
      created_by: actorId,
      updated_by: actorId,
      ws_id: workspaceId,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateWorkspaceExternalProjectBlock(
  blockId: string,
  payload: Partial<{
    block_type: string;
    content: Json;
    sort_order: number;
    title: string | null;
  }> & {
    actorId: string;
  },
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { actorId, ...values } = payload;
  const { data, error } = await admin
    .from('workspace_external_project_blocks')
    .update({
      ...values,
      updated_by: actorId,
    })
    .eq('id', blockId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

type UpsertEntryPayload = {
  collection_id: string;
  metadata: Json;
  profile_data: Json;
  scheduled_for?: string | null;
  slug: string;
  status: ExternalProjectEntry['status'];
  subtitle?: string | null;
  summary?: string | null;
  title: string;
  actorId: string;
  workspaceId: string;
};

export async function createWorkspaceExternalProjectEntry(
  payload: UpsertEntryPayload,
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { actorId, workspaceId, ...values } = payload;
  const { data, error } = await admin
    .from('workspace_external_project_entries')
    .insert({
      ...values,
      created_by: actorId,
      updated_by: actorId,
      ws_id: workspaceId,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateWorkspaceExternalProjectEntry(
  entryId: string,
  payload: Partial<{
    metadata: Json;
    profile_data: Json;
    scheduled_for: string | null;
    slug: string;
    status: ExternalProjectEntry['status'];
    subtitle: string | null;
    summary: string | null;
    title: string;
  }> & {
    actorId: string;
  },
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { actorId, ...values } = payload;
  const { data, error } = await admin
    .from('workspace_external_project_entries')
    .update({
      ...values,
      updated_by: actorId,
    })
    .eq('id', entryId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deleteWorkspaceExternalProjectEntry(
  entryId: string,
  payload: {
    workspaceId: string;
  },
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { workspaceId } = payload;

  const { error: deleteAssetsError } = await admin
    .from('workspace_external_project_assets')
    .delete()
    .eq('ws_id', workspaceId)
    .eq('entry_id', entryId);

  if (deleteAssetsError) {
    throw new Error(deleteAssetsError.message);
  }

  const { error: deleteBlocksError } = await admin
    .from('workspace_external_project_blocks')
    .delete()
    .eq('ws_id', workspaceId)
    .eq('entry_id', entryId);

  if (deleteBlocksError) {
    throw new Error(deleteBlocksError.message);
  }

  const { error } = await admin
    .from('workspace_external_project_entries')
    .delete()
    .eq('ws_id', workspaceId)
    .eq('id', entryId);

  if (error) {
    throw new Error(error.message);
  }

  return { id: entryId };
}

async function buildDuplicateEntrySlug(
  admin: AdminDb,
  workspaceId: string,
  seed: string
) {
  const normalizedSeed = `${seed}-copy`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 96);

  const { data, error } = await admin
    .from('workspace_external_project_entries')
    .select('slug')
    .eq('ws_id', workspaceId)
    .ilike('slug', `${normalizedSeed}%`);

  if (error) {
    throw new Error(error.message);
  }

  const existing = new Set((data ?? []).map((entry) => entry.slug));
  if (!existing.has(normalizedSeed)) {
    return normalizedSeed;
  }

  let suffix = 2;
  while (existing.has(`${normalizedSeed}-${suffix}`)) {
    suffix += 1;
  }

  return `${normalizedSeed}-${suffix}`;
}

export async function duplicateWorkspaceExternalProjectEntry(
  {
    actorId,
    entryId,
    workspaceId,
  }: {
    actorId: string;
    entryId: string;
    workspaceId: string;
  },
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { data: sourceEntry, error: sourceEntryError } = await admin
    .from('workspace_external_project_entries')
    .select('*')
    .eq('id', entryId)
    .eq('ws_id', workspaceId)
    .single();

  if (sourceEntryError) {
    throw new Error(sourceEntryError.message);
  }

  const nextSlug = await buildDuplicateEntrySlug(
    admin,
    workspaceId,
    sourceEntry.slug
  );

  const { data: duplicatedEntry, error: duplicateError } = await admin
    .from('workspace_external_project_entries')
    .insert({
      collection_id: sourceEntry.collection_id,
      created_by: actorId,
      metadata: sourceEntry.metadata,
      profile_data: sourceEntry.profile_data,
      published_at: null,
      scheduled_for: null,
      slug: nextSlug,
      status: 'draft',
      subtitle: sourceEntry.subtitle,
      summary: sourceEntry.summary,
      title: `${sourceEntry.title} Copy`,
      updated_by: actorId,
      ws_id: workspaceId,
    })
    .select('*')
    .single();

  if (duplicateError) {
    throw new Error(duplicateError.message);
  }

  const [sourceBlocks, sourceAssets] = await Promise.all([
    listWorkspaceExternalProjectBlocksByEntryIds(workspaceId, [entryId], admin),
    listWorkspaceExternalProjectAssetsByEntryIds(workspaceId, [entryId], admin),
  ]);

  const blockIdMap = new Map<string, string>();
  if (sourceBlocks.length > 0) {
    const { data: duplicatedBlocks, error: blockError } = await admin
      .from('workspace_external_project_blocks')
      .insert(
        sourceBlocks.map((block) => ({
          block_type: block.block_type,
          content: block.content,
          created_by: actorId,
          entry_id: duplicatedEntry.id,
          sort_order: block.sort_order,
          title: block.title,
          updated_by: actorId,
          ws_id: workspaceId,
        }))
      )
      .select('*');

    if (blockError) {
      throw new Error(blockError.message);
    }

    for (const [index, block] of sourceBlocks.entries()) {
      const duplicatedBlock = duplicatedBlocks?.[index];
      if (duplicatedBlock) {
        blockIdMap.set(block.id, duplicatedBlock.id);
      }
    }
  }

  if (sourceAssets.length > 0) {
    const { error: assetError } = await admin
      .from('workspace_external_project_assets')
      .insert(
        sourceAssets.map((asset) => ({
          alt_text: asset.alt_text,
          asset_type: asset.asset_type,
          block_id: asset.block_id
            ? (blockIdMap.get(asset.block_id) ?? null)
            : null,
          created_by: actorId,
          entry_id: duplicatedEntry.id,
          metadata: asset.metadata,
          sort_order: asset.sort_order,
          source_url: asset.source_url,
          storage_path: asset.storage_path,
          updated_by: actorId,
          ws_id: workspaceId,
        }))
      );

    if (assetError) {
      throw new Error(assetError.message);
    }
  }

  return duplicatedEntry;
}

export async function bulkUpdateWorkspaceExternalProjectEntries(
  {
    actorId,
    binding,
    payload,
    workspaceId,
  }: {
    actorId: string;
    binding: WorkspaceExternalProjectBinding;
    payload: ExternalProjectBulkUpdatePayload;
    workspaceId: string;
  },
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const entryIds = Array.from(new Set(payload.entryIds));

  if (entryIds.length === 0) {
    return [];
  }

  if (payload.action === 'publish' || payload.action === 'unpublish') {
    return Promise.all(
      entryIds.map((entryId) =>
        publishWorkspaceExternalProjectEntry(
          {
            actorId,
            binding,
            entryId,
            eventKind: payload.action === 'publish' ? 'publish' : 'unpublish',
            visibilityScope:
              payload.action === 'publish' ? 'public' : 'preview',
            workspaceId,
          },
          admin
        )
      )
    );
  }

  let nextStatus: ExternalProjectEntryStatus;
  let scheduledFor: string | null | undefined;
  let publishedAt: string | null | undefined;

  switch (payload.action) {
    case 'archive':
      nextStatus = 'archived';
      scheduledFor = null;
      publishedAt = null;
      break;
    case 'restore-draft':
      nextStatus = 'draft';
      scheduledFor = null;
      publishedAt = null;
      break;
    case 'schedule':
      nextStatus = 'scheduled';
      scheduledFor = payload.scheduledFor ?? null;
      publishedAt = null;
      break;
    case 'set-status':
      nextStatus = payload.status ?? 'draft';
      scheduledFor =
        nextStatus === 'scheduled' ? (payload.scheduledFor ?? null) : null;
      publishedAt =
        nextStatus === 'published' ? new Date().toISOString() : null;
      break;
    default:
      nextStatus = 'draft';
      scheduledFor = null;
      publishedAt = null;
  }

  const { data, error } = await admin
    .from('workspace_external_project_entries')
    .update({
      published_at: publishedAt,
      scheduled_for: scheduledFor,
      status: nextStatus,
      updated_by: actorId,
    })
    .eq('ws_id', workspaceId)
    .in('id', entryIds)
    .select('*');

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

type UpsertAssetPayload = {
  asset_type: string;
  alt_text?: string | null;
  block_id?: string | null;
  entry_id?: string | null;
  metadata: Json;
  sort_order?: number;
  source_url?: string | null;
  stable_source_id?: string | null;
  storage_path?: string | null;
  actorId: string;
  workspaceId: string;
};

export async function createWorkspaceExternalProjectAsset(
  payload: UpsertAssetPayload,
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { actorId, workspaceId, ...values } = payload;
  const { data, error } = await admin
    .from('workspace_external_project_assets')
    .insert({
      ...values,
      created_by: actorId,
      updated_by: actorId,
      ws_id: workspaceId,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateWorkspaceExternalProjectAsset(
  assetId: string,
  payload: Partial<{
    asset_type: string;
    alt_text: string | null;
    block_id: string | null;
    entry_id: string | null;
    metadata: Json;
    sort_order: number;
    source_url: string | null;
    storage_path: string | null;
  }> & {
    actorId: string;
  },
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const { actorId, ...values } = payload;
  const { data, error } = await admin
    .from('workspace_external_project_assets')
    .update({
      ...values,
      updated_by: actorId,
    })
    .eq('id', assetId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function publishWorkspaceExternalProjectEntry(
  {
    actorId,
    binding,
    entryId,
    eventKind,
    visibilityScope,
    workspaceId,
  }: {
    actorId: string;
    binding: WorkspaceExternalProjectBinding;
    entryId: string;
    eventKind: 'publish' | 'preview' | 'unpublish';
    visibilityScope: string;
    workspaceId: string;
  },
  db?: AdminDb
) {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  const nextStatus = eventKind === 'unpublish' ? 'draft' : 'published';
  const publishedAt =
    nextStatus === 'published' ? new Date().toISOString() : null;

  const { data: entry, error: entryError } = await admin
    .from('workspace_external_project_entries')
    .update({
      published_at: publishedAt,
      status: nextStatus,
      updated_by: actorId,
    })
    .eq('id', entryId)
    .eq('ws_id', workspaceId)
    .select('*')
    .single();

  if (entryError) {
    throw new Error(entryError.message);
  }

  const payload = await buildWorkspaceExternalProjectDeliveryPayload(
    {
      binding,
      includeDrafts: eventKind === 'preview',
      workspaceId,
    },
    admin
  );

  const { error: eventError } = await admin
    .from('workspace_external_project_publish_events')
    .insert([
      {
        canonical_external_project_id: binding.canonical_id as string,
        entry_id: entry.id,
        event_kind: eventKind,
        payload: payload as Json,
        profile_data: payload.profileData as Json,
        triggered_by: actorId,
        visibility_scope: visibilityScope,
        ws_id: workspaceId,
      },
    ]);

  if (eventError) {
    throw new Error(eventError.message);
  }

  return entry;
}

async function findOrCreateCollection(
  workspaceId: string,
  actorId: string,
  collection: {
    collectionType: string;
    description?: string;
    slug: string;
    title: string;
  },
  db: AdminDb
) {
  const { data: existing } = await db
    .from('workspace_external_project_collections')
    .select('*')
    .eq('ws_id', workspaceId)
    .eq('slug', collection.slug)
    .maybeSingle();

  if (existing) {
    const { data, error } = await db
      .from('workspace_external_project_collections')
      .update({
        collection_type: collection.collectionType,
        description: collection.description ?? null,
        title: collection.title,
        updated_by: actorId,
      })
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return { collection: data, created: false };
  }

  const { data, error } = await db
    .from('workspace_external_project_collections')
    .insert({
      collection_type: collection.collectionType,
      created_by: actorId,
      description: collection.description ?? null,
      slug: collection.slug,
      title: collection.title,
      updated_by: actorId,
      ws_id: workspaceId,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return { collection: data, created: true };
}

async function findOrCreateEntry(
  workspaceId: string,
  collectionId: string,
  actorId: string,
  entry: {
    metadata?: Json;
    profileData?: Json;
    slug: string;
    sourceAdapter: WorkspaceExternalProjectBinding['adapter'];
    sourceId: string;
    status?: 'draft' | 'published' | 'scheduled' | 'archived';
    subtitle?: string;
    summary?: string;
    title: string;
  },
  db: AdminDb
) {
  const { data: existing } = await db
    .from('workspace_external_project_entries')
    .select('*')
    .eq('ws_id', workspaceId)
    .eq('collection_id', collectionId)
    .eq('stable_source_id', entry.sourceId)
    .maybeSingle();

  const values = {
    collection_id: collectionId,
    metadata: entry.metadata ?? {},
    profile_data: entry.profileData ?? {},
    slug: entry.slug,
    source_adapter: entry.sourceAdapter,
    stable_source_id: entry.sourceId,
    status: entry.status ?? 'published',
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

    return { created: false, entry: data };
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

  return { created: true, entry: data };
}

export async function runWorkspaceExternalProjectImport(
  {
    actorId,
    binding,
    workspaceId,
  }: {
    actorId: string;
    binding: WorkspaceExternalProjectBinding;
    workspaceId: string;
  },
  db?: AdminDb
): Promise<ExternalProjectImportReport> {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);

  if (!binding.adapter || !binding.canonical_id) {
    throw new Error(
      'Workspace is not bound to a valid canonical external project'
    );
  }

  const fixture = externalProjectAdapterFixtures[binding.adapter];
  const warnings: string[] = [];

  let createdCollections = 0;
  let updatedCollections = 0;
  let createdEntries = 0;
  let updatedEntries = 0;
  let createdBlocks = 0;
  let updatedBlocks = 0;
  let createdAssets = 0;
  let updatedAssets = 0;

  const { data: job, error: jobError } = await admin
    .from('workspace_external_project_import_jobs')
    .insert({
      adapter: binding.adapter,
      canonical_external_project_id: binding.canonical_id,
      requested_by: actorId,
      source_reference: fixture.sourceReference,
      started_at: new Date().toISOString(),
      status: 'running',
      ws_id: workspaceId,
    })
    .select('*')
    .single();

  if (jobError) {
    throw new Error(jobError.message);
  }

  try {
    for (const collection of fixture.collections) {
      const collectionResult = await findOrCreateCollection(
        workspaceId,
        actorId,
        collection,
        admin
      );

      if (collectionResult.created) {
        createdCollections += 1;
      } else {
        updatedCollections += 1;
      }

      for (const entry of collection.entries) {
        const entryResult = await findOrCreateEntry(
          workspaceId,
          collectionResult.collection.id,
          actorId,
          {
            ...entry,
            metadata: asJsonObject(entry.metadata),
            profileData: asJsonObject(entry.profileData),
            sourceAdapter: binding.adapter,
          },
          admin
        );

        if (entryResult.created) {
          createdEntries += 1;
        } else {
          updatedEntries += 1;
        }

        for (const [index, block] of entry.blocks.entries()) {
          const { data: existingBlock } = await admin
            .from('workspace_external_project_blocks')
            .select('id')
            .eq('ws_id', workspaceId)
            .eq('entry_id', entryResult.entry.id)
            .eq('stable_source_id', block.sourceId)
            .maybeSingle();

          if (existingBlock) {
            const { error } = await admin
              .from('workspace_external_project_blocks')
              .update({
                block_type: block.blockType,
                content: asJsonObject(block.content),
                sort_order: index,
                title: block.title ?? null,
                updated_by: actorId,
              })
              .eq('id', existingBlock.id);

            if (error) throw new Error(error.message);
            updatedBlocks += 1;
          } else {
            const { error } = await admin
              .from('workspace_external_project_blocks')
              .insert({
                block_type: block.blockType,
                content: asJsonObject(block.content),
                created_by: actorId,
                entry_id: entryResult.entry.id,
                sort_order: index,
                stable_source_id: block.sourceId,
                title: block.title ?? null,
                updated_by: actorId,
                ws_id: workspaceId,
              });

            if (error) throw new Error(error.message);
            createdBlocks += 1;
          }
        }

        for (const [index, asset] of (entry.assets ?? []).entries()) {
          const { data: existingAsset } = await admin
            .from('workspace_external_project_assets')
            .select('id')
            .eq('ws_id', workspaceId)
            .eq('stable_source_id', asset.sourceId)
            .maybeSingle();

          if (existingAsset) {
            const { error } = await admin
              .from('workspace_external_project_assets')
              .update({
                alt_text: asset.altText ?? null,
                asset_type: asset.assetType,
                entry_id: entryResult.entry.id,
                sort_order: index,
                source_url: asset.sourceUrl ?? null,
                storage_path: asset.storagePath ?? null,
                updated_by: actorId,
              })
              .eq('id', existingAsset.id);

            if (error) throw new Error(error.message);
            updatedAssets += 1;
          } else {
            const { error } = await admin
              .from('workspace_external_project_assets')
              .insert({
                alt_text: asset.altText ?? null,
                asset_type: asset.assetType,
                created_by: actorId,
                entry_id: entryResult.entry.id,
                sort_order: index,
                source_url: asset.sourceUrl ?? null,
                stable_source_id: asset.sourceId,
                storage_path: asset.storagePath ?? null,
                updated_by: actorId,
                ws_id: workspaceId,
              });

            if (error) throw new Error(error.message);
            createdAssets += 1;
          }
        }
      }
    }
  } catch (error) {
    const report = {
      adapter: binding.adapter,
      canonicalProjectId: binding.canonical_id,
      createdAssets,
      createdBlocks,
      createdCollections,
      createdEntries,
      sourceReference: fixture.sourceReference,
      updatedAssets,
      updatedBlocks,
      updatedCollections,
      updatedEntries,
      warnings: [
        ...warnings,
        error instanceof Error ? error.message : 'Unknown import failure',
      ],
    } satisfies ExternalProjectImportReport;

    await admin
      .from('workspace_external_project_import_jobs')
      .update({
        completed_at: new Date().toISOString(),
        report,
        status: 'failed',
      })
      .eq('id', job.id);

    throw error;
  }

  const report = {
    adapter: binding.adapter,
    canonicalProjectId: binding.canonical_id,
    createdAssets,
    createdBlocks,
    createdCollections,
    createdEntries,
    sourceReference: fixture.sourceReference,
    updatedAssets,
    updatedBlocks,
    updatedCollections,
    updatedEntries,
    warnings,
  } satisfies ExternalProjectImportReport;

  await admin
    .from('workspace_external_project_import_jobs')
    .update({
      completed_at: new Date().toISOString(),
      report,
      status: 'completed',
    })
    .eq('id', job.id);

  return report;
}

export async function buildWorkspaceExternalProjectDeliveryPayload(
  {
    binding,
    includeDrafts,
    workspaceId,
  }: {
    binding: WorkspaceExternalProjectBinding;
    includeDrafts: boolean;
    workspaceId: string;
  },
  db?: AdminDb
): Promise<ExternalProjectDeliveryPayload> {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);
  if (!binding.canonical_id || !binding.adapter) {
    throw new Error('Workspace binding is incomplete');
  }

  const profileData =
    binding.canonical_project?.delivery_profile !== null &&
    binding.canonical_project?.delivery_profile !== undefined
      ? asJsonObject(binding.canonical_project.delivery_profile)
      : asJsonObject(
          externalProjectAdapterFixtures[binding.adapter].profileData
        );

  const collections = await listWorkspaceExternalProjectCollections(
    workspaceId,
    admin
  );
  const entries = await listWorkspaceExternalProjectEntries(
    workspaceId,
    { includeDrafts },
    admin
  );
  const entryIds = entries.map((entry) => entry.id);

  const [blocks, assets] = await Promise.all([
    listWorkspaceExternalProjectBlocksByEntryIds(workspaceId, entryIds, admin),
    listWorkspaceExternalProjectAssetsByEntryIds(workspaceId, entryIds, admin),
  ]);

  const collectionsPayload = collections.map((collection) => ({
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
            assetUrl: buildDeliveryAssetUrl(workspaceId, asset),
            block_id: asset.block_id,
            entry_id: asset.entry_id,
            id: asset.id,
            metadata: asset.metadata,
            sort_order: asset.sort_order,
            source_url: asset.source_url,
            storage_path: asset.storage_path,
          })),
        blocks: blocks.filter((block) => block.entry_id === entry.id),
      })),
  }));
  const loadingData = buildExternalProjectLoadingData(
    binding.adapter,
    collectionsPayload
  );

  return {
    adapter: binding.adapter,
    canonicalProjectId: binding.canonical_id,
    collections: collectionsPayload,
    generatedAt: new Date().toISOString(),
    loadingData,
    profileData,
    workspaceId,
  };
}
