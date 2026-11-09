import type { ImageTransformOptions, Json } from '@tuturuuu/types';

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
  try {
    const url = new URL(source);
    const configured = [
      process.env.SUPABASE_SERVER_URL,
      process.env[`${'NEXT_PUBLIC'}_SUPABASE_URL`],
    ];
    if (
      !configured.some(
        (origin) => origin && new URL(origin).origin === url.origin
      )
    )
      return source;
    if (
      /^\/storage\/v1\/(?:object|render\/image)\/public\//u.test(url.pathname)
    )
      return source;
    return /^\/storage\/v1\/(?:object|render\/image)\/sign\/workspaces\//u.test(
      url.pathname
    )
      ? assetUrl
      : null;
  } catch {
    return null;
  }
}

export function safeExternalProjectDeliveryMetadata(
  value: Json,
  assetUrl: string
): Json {
  if (typeof value === 'string') {
    try {
      new URL(value);
    } catch {
      return value;
    }
    return safeExternalProjectDeliverySourceUrl(value, assetUrl);
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
