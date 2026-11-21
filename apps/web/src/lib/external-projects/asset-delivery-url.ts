import type {
  ExternalProjectAsset,
  ImageTransformOptions,
  Json,
} from '@tuturuuu/types';

export function projectDeliveryAsset(
  workspaceId: string,
  asset: ExternalProjectAsset,
  published: boolean
) {
  const assetUrl = buildDeliveryAssetUrl(workspaceId, asset);
  return {
    alt_text: asset.alt_text,
    asset_type: asset.asset_type,
    assetUrl,
    block_id: asset.block_id,
    entry_id: asset.entry_id,
    id: asset.id,
    metadata: safeExternalProjectDeliveryMetadata(asset.metadata, assetUrl),
    sort_order: asset.sort_order,
    source_url: safeExternalProjectDeliverySourceUrl(
      asset.source_url,
      assetUrl
    ),
    storage_path: asset.storage_path,
    updated_at: asset.updated_at,
    published,
    assetRevision: getExternalProjectAssetRevision(asset.updated_at),
  };
}

export function buildDeliveryAssetUrl(
  workspaceId: string,
  asset: {
    id: string;
    updated_at: string;
  },
  options?: {
    transform?: ImageTransformOptions;
  }
) {
  const searchParams = new URLSearchParams();
  searchParams.set('v', getExternalProjectAssetRevision(asset.updated_at));

  if (options?.transform?.width !== undefined) {
    searchParams.set('width', options.transform.width.toString());
  }

  if (options?.transform?.height !== undefined) {
    searchParams.set('height', options.transform.height.toString());
  }

  if (options?.transform?.resize) {
    searchParams.set('resize', options.transform.resize);
  }

  if (options?.transform?.quality !== undefined) {
    searchParams.set('quality', options.transform.quality.toString());
  }

  if (options?.transform?.format) {
    searchParams.set('format', options.transform.format);
  }

  const queryString = searchParams.toString();

  return `/api/v1/workspaces/${workspaceId}/external-projects/assets/${asset.id}${queryString ? `?${queryString}` : ''}`;
}

export function getExternalProjectAssetRevision(updatedAt: string) {
  return updatedAt.replace(/\D/g, '') || '0';
}

/** Public delivery JSON must not reveal a second direct path to our CDN. */
export function safeExternalProjectDeliverySourceUrl(
  source: string | null,
  assetUrl: string
) {
  if (!source) return null;
  return assetUrl;
}

export function safeExternalProjectDeliveryMetadata(
  value: Json,
  assetUrl: string
): Json {
  if (typeof value === 'string') {
    const normalized = value.trim().replaceAll('\\', '/');
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/?storage\/v1\/)/i.test(normalized))
      return null;
    return value;
  }
  if (Array.isArray(value))
    return value.map((item) =>
      safeExternalProjectDeliveryMetadata(item, assetUrl)
    );
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        item === undefined
          ? undefined
          : safeExternalProjectDeliveryMetadata(item, assetUrl),
      ])
    );
  }
  return value;
}
