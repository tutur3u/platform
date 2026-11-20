import { createHash } from 'node:crypto';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  parseWebglPackageArtifactMetadata,
  WEBGL_PACKAGE_ASSET_TYPE,
} from './webgl-package-artifact';

type Entry = { id: string; published_at: string | null; profile_data: unknown };
type Asset = { id: string; entry_id: string | null; updated_at: string };
type Block = { id: string; entry_id: string; updated_at: string };
type AttachedAsset = Asset & {
  asset_type?: string;
  block_id?: string | null;
  metadata?: unknown;
  storage_path?: string | null;
};

export function publicationEventId(
  workspaceId: string,
  canonicalProjectId: string,
  entryId: string,
  kind: 'publish' | 'unpublish',
  revision: string
) {
  const digest = createHash('sha256')
    .update(
      JSON.stringify([workspaceId, canonicalProjectId, entryId, kind, revision])
    )
    .digest();
  digest[6] = (digest[6]! & 0x0f) | 0x80;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = digest.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

function isEntryWebglPackage(asset: AttachedAsset) {
  if (asset.block_id || asset.asset_type !== WEBGL_PACKAGE_ASSET_TYPE)
    return false;
  const artifact = parseWebglPackageArtifactMetadata(asset.metadata);
  return artifact !== null && artifact.rootPath === asset.storage_path;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function publishedAssetManifest(
  entry: Entry,
  assets: AttachedAsset[],
  blocks: Block[]
) {
  const media = Object.values(record(record(entry.profile_data).media));
  const blockIds = new Set(
    blocks
      .filter(
        (block) =>
          block.entry_id === entry.id &&
          beforePublication(block.updated_at, entry.published_at)
      )
      .map((block) => block.id)
  );
  return Object.fromEntries(
    assets
      .filter(
        (asset) =>
          asset.entry_id === entry.id &&
          beforePublication(asset.updated_at, entry.published_at) &&
          (media.includes(asset.id) ||
            (asset.block_id && blockIds.has(asset.block_id)) ||
            isEntryWebglPackage(asset))
      )
      .map((asset) => [asset.id, asset.updated_at])
  );
}

function beforePublication(updated: string, published: string | null) {
  if (published === null) return false;
  const millis = Date.parse(updated) - Date.parse(published);
  if (millis !== 0) return millis < 0;
  const subMillisecond = (date: string) =>
    (date.match(/\.(\d{4,})/)?.[1] ?? '').padEnd(6, '0').slice(3, 6);
  return subMillisecond(updated) <= subMillisecond(published);
}

function eventManifest(
  payload: unknown,
  entry: Entry
): Record<string, unknown> | null {
  const body = record(payload);
  if (body.assetPublicationAt === entry.published_at) {
    return Object.fromEntries(
      Object.entries(record(body.publishedAssetManifest)).filter(
        ([, updated]) =>
          typeof updated === 'string' &&
          beforePublication(updated, entry.published_at)
      )
    );
  }

  // Legacy records identify the published revision in the delivery snapshot.
  if (!Array.isArray(body.collections)) return null;
  for (const collection of body.collections) {
    const rows = record(collection).entries;
    if (!Array.isArray(rows)) continue;
    for (const candidate of rows) {
      const published = record(candidate);
      if (
        published.id !== entry.id ||
        published.published_at !== entry.published_at ||
        published.status !== 'published' ||
        !Array.isArray(published.assets)
      )
        continue;
      const attached = published.assets
        .map(record)
        .filter(
          (asset) =>
            asset.entry_id === entry.id &&
            typeof asset.id === 'string' &&
            typeof asset.updated_at === 'string' &&
            beforePublication(asset.updated_at, entry.published_at)
        );
      const profile = record(published.profile_data);
      if (profile.schema !== 'fysh/1') {
        return Object.fromEntries(
          attached.map((asset) => [asset.id, asset.updated_at])
        );
      }
      const media = Object.values(record(profile.media));
      return Object.fromEntries(
        attached
          .filter((asset) => media.includes(asset.id))
          .map((asset) => [asset.id, asset.updated_at])
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
  const revisions = new Map<string, Entry>();
  for (const entry of entries) {
    if (!entry.published_at) continue;
    revisions.set(
      publicationEventId(
        workspaceId,
        canonicalProjectId,
        entry.id,
        'publish',
        entry.published_at
      ),
      entry
    );
  }

  const publicEvents = <Columns extends string>(columns: Columns) =>
    admin
      .from('workspace_external_project_publish_events')
      .select(columns)
      .eq('ws_id', workspaceId)
      .eq('canonical_external_project_id', canonicalProjectId)
      .eq('event_kind', 'publish')
      .eq('visibility_scope', 'public');

  const ids = [...revisions.keys()];
  for (let start = 0; start < ids.length; start += 50) {
    const { data, error } = await publicEvents(
      'id,entry_id,assetPublicationAt:payload->>assetPublicationAt,publishedAssetManifest:payload->publishedAssetManifest'
    ).in('id', ids.slice(start, start + 50));
    if (error) throw new Error('Could not verify published media');
    for (const event of data ?? []) {
      const entry = revisions.get(event.id);
      if (!entry || entry.id !== event.entry_id) continue;
      const manifest = eventManifest(event, entry);
      if (manifest) manifests.set(entry.id, manifest);
    }
  }

  // Legacy revisions have random event IDs. Give each entry its own lookup budget.
  const legacy = [...revisions.values()].filter(
    (entry) => !manifests.has(entry.id)
  );
  for (let start = 0; start < legacy.length; start += 8) {
    await Promise.all(
      legacy.slice(start, start + 8).map(async (entry) => {
        const { data, error } = await publicEvents('entry_id,payload')
          .eq('entry_id', entry.id)
          .order('created_at', { ascending: false })
          .limit(16);
        if (error) throw new Error('Could not verify published media');
        for (const event of data ?? []) {
          if (event.entry_id !== entry.id) continue;
          const manifest = eventManifest(event.payload, entry);
          if (!manifest) continue;
          manifests.set(entry.id, manifest);
          break;
        }
      })
    );
  }
  return manifests;
}

export function isPublishedAsset(
  manifests: Map<string, Record<string, unknown>>,
  asset: Asset
) {
  if (!asset.entry_id) return false;
  const manifest = manifests.get(asset.entry_id);
  return (
    manifest !== undefined &&
    Object.hasOwn(manifest, asset.id) &&
    manifest[asset.id] === asset.updated_at
  );
}

export function privateExternalProjectCollection(collection: {
  slug: string;
  config: unknown;
}) {
  return (
    collection.slug === 'contact-submissions' ||
    record(collection.config).privateDelivery === true
  );
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
    workspace_external_project_collections: {
      slug: string;
      config: unknown;
    } | null;
  } | null
) {
  if (
    !asset.entry_id ||
    parent?.status !== 'published' ||
    !parent.workspace_external_project_collections ||
    privateExternalProjectCollection(
      parent.workspace_external_project_collections
    ) ||
    record(parent.metadata).privateDelivery === true ||
    !beforePublication(asset.updated_at, parent.published_at)
  )
    return false;

  try {
    const manifests = await loadPublishedAssetManifests(
      admin,
      workspaceId,
      canonicalProjectId,
      [
        {
          id: asset.entry_id,
          published_at: parent.published_at,
          profile_data: null,
        },
      ]
    );
    return isPublishedAsset(manifests, asset);
  } catch {
    return false;
  }
}
