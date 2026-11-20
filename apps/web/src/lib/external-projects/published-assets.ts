import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

type Entry = { id: string; published_at: string | null; profile_data: unknown };
type Asset = { id: string; entry_id: string | null; updated_at: string };
type Block = { id: string; entry_id: string; updated_at: string };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function publishedAssetManifest(
  entry: Entry,
  assets: (Asset & { block_id?: string | null })[],
  blocks: Block[]
) {
  const media = Object.values(record(record(entry.profile_data).media));
  const blockIds = new Set(
    blocks
      .filter((block) => block.entry_id === entry.id && beforePublication(block.updated_at, entry.published_at))
      .map((block) => block.id)
  );
  return Object.fromEntries(
    assets
      .filter((asset) =>
        asset.entry_id === entry.id &&
        beforePublication(asset.updated_at, entry.published_at) &&
        (media.includes(asset.id) || (asset.block_id && blockIds.has(asset.block_id)))
      )
      .map((asset) => [asset.id, asset.updated_at])
  );
}

function beforePublication(updated: string, published: string | null) {
  return published !== null && Date.parse(updated) <= Date.parse(published);
}

function eventManifest(payload: unknown, entry: Entry): Record<string, unknown> | null {
  const body = record(payload);
  if (body.assetPublicationAt === entry.published_at) {
    return Object.fromEntries(Object.entries(record(body.publishedAssetManifest)).filter(
      ([, updated]) => typeof updated === 'string' && beforePublication(updated, entry.published_at)
    ));
  }

  // Legacy records identify the published revision in the delivery snapshot.
  if (!Array.isArray(body.collections)) return null;
  for (const collection of body.collections) {
    const rows = record(collection).entries;
    if (!Array.isArray(rows)) continue;
    for (const candidate of rows) {
      const published = record(candidate);
      if (published.id !== entry.id || published.published_at !== entry.published_at ||
          published.status !== 'published' || !Array.isArray(published.assets)) continue;
      const attached = published.assets.map(record).filter((asset) =>
        asset.entry_id === entry.id && typeof asset.id === 'string' &&
        typeof asset.updated_at === 'string' && beforePublication(asset.updated_at, entry.published_at)
      );
      const profile = record(published.profile_data);
      if (profile.schema !== 'fysh/1') {
        return Object.fromEntries(attached.map((asset) => [asset.id, asset.updated_at]));
      }
      const media = Object.values(record(profile.media));
      return Object.fromEntries(
        attached.filter((asset) => media.includes(asset.id)).map((asset) => [asset.id, asset.updated_at])
      );
    }
  }
  return null;
}

export async function loadPublishedAssetManifests(
  admin: TypedSupabaseClient,
  workspaceId: string,
  canonicalProjectId: string,
  entries: Entry[]
) {
  const manifests = new Map<string, Record<string, unknown>>();
  const candidates = new Map(entries.filter((entry) => entry.published_at).map((entry) => [entry.id, entry]));
  const ids = [...candidates.keys()];

  for (let start = 0; start < ids.length; start += 50) {
    const { data, error } = await admin
      .from('workspace_external_project_publish_events')
      .select('entry_id,payload')
      .eq('ws_id', workspaceId)
      .eq('canonical_external_project_id', canonicalProjectId)
      .eq('event_kind', 'publish')
      .eq('visibility_scope', 'public')
      .in('entry_id', ids.slice(start, start + 50))
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw new Error('Could not verify published media');
    for (const event of data ?? []) {
      const id = event.entry_id;
      const entry = id ? candidates.get(id) : undefined;
      if (!id || !entry || manifests.has(id)) continue;
      const manifest = eventManifest(event.payload, entry);
      if (manifest) manifests.set(id, manifest);
    }
  }
  return manifests;
}

export function isPublishedAsset(
  manifests: Map<string, Record<string, unknown>>,
  asset: Asset
) {
  if (!asset.entry_id) return false;
  const manifest = manifests.get(asset.entry_id);
  return manifest !== undefined &&
    Object.hasOwn(manifest, asset.id) &&
    manifest[asset.id] === asset.updated_at;
}

export function privateExternalProjectCollection(collection: {
  slug: string;
  config: unknown;
}) {
  return collection.slug === 'contact-submissions' ||
    record(collection.config).privateDelivery === true;
}

export async function canReadPublishedAsset(
  admin: TypedSupabaseClient,
  workspaceId: string,
  canonicalProjectId: string,
  asset: Asset,
  parent: {
    published_at: string | null;
    status: string;
    metadata: unknown;
    workspace_external_project_collections: { slug: string; config: unknown } | null;
  } | null
) {
  if (
    !asset.entry_id ||
    parent?.status !== 'published' ||
    !parent.workspace_external_project_collections ||
    privateExternalProjectCollection(parent.workspace_external_project_collections) ||
    record(parent.metadata).privateDelivery === true ||
    !beforePublication(asset.updated_at, parent.published_at)
  ) return false;

  try {
    const manifests = await loadPublishedAssetManifests(admin, workspaceId, canonicalProjectId, [
      { id: asset.entry_id, published_at: parent.published_at, profile_data: null },
    ]);
    return isPublishedAsset(manifests, asset);
  } catch {
    return false;
  }
}
