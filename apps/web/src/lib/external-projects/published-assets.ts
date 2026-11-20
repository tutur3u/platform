import { createHash } from 'node:crypto';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  assetBytesDigest,
  readExternalProjectAssetBytes,
} from './asset-publication-bytes';
import { assetPublicationProofs } from './asset-publication-store';
import {
  parseWebglPackageArtifactMetadata,
  WEBGL_PACKAGE_ASSET_TYPE,
  WEBGL_PACKAGE_METADATA_VERSION,
} from './webgl-package-artifact';

type Entry = {
  id: string;
  published_at: string | null;
  updated_at: string;
  profile_data: unknown;
  metadata?: unknown;
};
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

export function assetPublicationProofId(
  workspaceId: string,
  canonicalProjectId: string,
  entry: Pick<Entry, 'id' | 'published_at' | 'updated_at'>
) {
  return publicationEventId(
    workspaceId,
    canonicalProjectId,
    entry.id,
    'publish',
    `${entry.published_at}/${entry.updated_at}`
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isEntryWebglPackage(asset: AttachedAsset) {
  if (asset.block_id || asset.asset_type !== WEBGL_PACKAGE_ASSET_TYPE)
    return false;
  const artifact = parseWebglPackageArtifactMetadata(asset.metadata);
  return (
    artifact?.version === WEBGL_PACKAGE_METADATA_VERSION &&
    artifact.rootPath === asset.storage_path
  );
}

function entryAssetReferences(entry: Entry) {
  const references = new Set<string>();
  const pending = [entry.profile_data, entry.metadata];
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value === 'string') {
      references.add(value);
    } else {
      for (const child of Array.isArray(value)
        ? value
        : Object.values(record(value))) {
        pending.push(child);
      }
    }
  }
  return references;
}

export function publishedAssetManifest(
  entry: Entry,
  assets: AttachedAsset[],
  blocks: Block[]
) {
  const references = entryAssetReferences(entry);
  const studioMedia = record(record(entry.profile_data).studioMedia);
  const hasSelectedWebgl = typeof studioMedia.webgl === 'string';
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
          (references.has(asset.id) ||
            (asset.block_id != null && blockIds.has(asset.block_id)) ||
            (!hasSelectedWebgl && isEntryWebglPackage(asset)))
      )
      .map((asset) => [asset.id, asset.updated_at])
  );
}

export type AssetPublicationManifest = Record<
  string,
  { revision: string; sha256: string }
>;

function webglInventoryDigest(asset: AttachedAsset) {
  const artifact = parseWebglPackageArtifactMetadata(asset.metadata);
  if (
    !artifact ||
    artifact.version !== WEBGL_PACKAGE_METADATA_VERSION ||
    artifact.rootPath !== asset.storage_path
  )
    return null;
  return assetBytesDigest(
    Buffer.from(
      JSON.stringify([
        artifact.provider,
        artifact.rootPath,
        artifact.entryRelativePath,
        artifact.files,
        artifact.assetUrls,
      ])
    )
  );
}

export const MAX_PUBLISHED_ENTRY_ASSETS = 24;

export class PublicationAssetLimitError extends Error {
  constructor() {
    super(
      `An entry can publish up to ${MAX_PUBLISHED_ENTRY_ASSETS} media assets`
    );
  }
}

export async function captureAssetProofs({
  workspaceId,
  entry,
  assets,
  blocks,
}: {
  workspaceId: string;
  entry: Entry;
  assets: AttachedAsset[];
  blocks: Block[];
}): Promise<AssetPublicationManifest> {
  const references = publishedAssetManifest(entry, assets, blocks);
  const selected = assets.filter((asset) =>
    Object.hasOwn(references, asset.id)
  );
  if (selected.length > MAX_PUBLISHED_ENTRY_ASSETS) {
    throw new PublicationAssetLimitError();
  }
  const manifest: AssetPublicationManifest = {};
  for (let start = 0; start < selected.length; start += 2) {
    await Promise.all(
      selected.slice(start, start + 2).map(async (asset) => {
        const object =
          asset.asset_type === WEBGL_PACKAGE_ASSET_TYPE
            ? null
            : await readExternalProjectAssetBytes(
                workspaceId,
                asset.storage_path ?? null
              );
        const sha256 =
          asset.asset_type === WEBGL_PACKAGE_ASSET_TYPE
            ? webglInventoryDigest(asset)
            : object && assetBytesDigest(object.buffer);
        if (sha256) manifest[asset.id] = { revision: asset.updated_at, sha256 };
      })
    );
  }
  return manifest;
}

function beforePublication(updated: string, published: string | null) {
  if (published === null) return false;
  const millis = Date.parse(updated) - Date.parse(published);
  if (millis !== 0) return millis < 0;
  const subMillisecond = (date: string) =>
    (date.match(/\.(\d{4,})/)?.[1] ?? '').padEnd(6, '0').slice(3, 6);
  return subMillisecond(updated) <= subMillisecond(published);
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
      assetPublicationProofId(workspaceId, canonicalProjectId, entry),
      entry
    );
  }

  const ids = [...revisions.keys()];
  for (let start = 0; start < ids.length; start += 50) {
    const { data, error } = await assetPublicationProofs(admin)
      .select('id,entry_id,published_at,entry_updated_at,asset_revisions')
      .eq('ws_id', workspaceId)
      .eq('canonical_external_project_id', canonicalProjectId)
      .in('id', ids.slice(start, start + 50));
    // Delivery can serve text while the proof migration rolls out.
    if (error?.code === '42P01' || error?.code === 'PGRST205') return new Map();
    if (error) throw new Error('Could not verify published media');
    for (const proof of data ?? []) {
      const entry = revisions.get(proof.id);
      if (
        !entry ||
        entry.id !== proof.entry_id ||
        entry.published_at !== proof.published_at ||
        entry.updated_at !== proof.entry_updated_at
      )
        continue;
      manifests.set(entry.id, record(proof.asset_revisions));
    }
  }

  return manifests;
}

export function publishedAssetDigest(
  manifests: Map<string, Record<string, unknown>>,
  asset: AttachedAsset
) {
  const manifest = asset.entry_id && manifests.get(asset.entry_id);
  if (!manifest || !Object.hasOwn(manifest, asset.id)) return null;
  const proof = record(manifest[asset.id]);
  if (
    proof.revision !== asset.updated_at ||
    typeof proof.sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(proof.sha256)
  )
    return null;
  if (asset.asset_type === WEBGL_PACKAGE_ASSET_TYPE)
    return webglInventoryDigest(asset) === proof.sha256 ? proof.sha256 : null;
  return proof.sha256;
}

export function isPublishedAsset(
  manifests: Map<string, Record<string, unknown>>,
  asset: AttachedAsset
) {
  return publishedAssetDigest(manifests, asset) !== null;
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

export async function readPublishedAssetDigest(
  admin: TypedSupabaseClient,
  workspaceId: string,
  canonicalProjectId: string,
  asset: AttachedAsset,
  parent: {
    published_at: string | null;
    updated_at: string;
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
    return null;

  try {
    const manifests = await loadPublishedAssetManifests(
      admin,
      workspaceId,
      canonicalProjectId,
      [
        {
          id: asset.entry_id,
          published_at: parent.published_at,
          updated_at: parent.updated_at,
          profile_data: null,
        },
      ]
    );
    return publishedAssetDigest(manifests, asset);
  } catch {
    return null;
  }
}
