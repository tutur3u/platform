export function cacheRequest({
  origin,
  site,
  path,
  locale,
  version,
  workspaceId,
  epoch,
}: {
  origin: string;
  site: string;
  path: string;
  locale: string;
  version: string;
  workspaceId: string;
  epoch: string;
}) {
  const key = new URL('/__cms/cache', origin);
  key.search = new URLSearchParams({
    site,
    workspaceId,
    epoch,
    path,
    locale,
    version,
  }).toString();
  return new Request(key);
}
