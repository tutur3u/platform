export function cacheRequest({
  origin,
  site,
  path,
  locale,
  version,
  workspaceId,
  epoch,
  deliveryVersion,
}: {
  origin: string;
  site: string;
  path: string;
  locale: string;
  version: string;
  workspaceId: string;
  epoch: string;
  /** Workspace delivery version; any publish changes it and misses the key. */
  deliveryVersion?: string;
}) {
  const key = new URL('/__cms/cache', origin);
  key.search = new URLSearchParams({
    site,
    workspaceId,
    epoch,
    path,
    locale,
    version,
    ...(deliveryVersion ? { deliveryVersion } : {}),
  }).toString();
  return new Request(key);
}
