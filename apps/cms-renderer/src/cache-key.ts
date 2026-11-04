export function cacheRequest({
  origin,
  site,
  path,
  locale,
  version,
}: {
  origin: string;
  site: string;
  path: string;
  locale: string;
  version: string;
}) {
  const key = new URL('/__cms/cache', origin);
  key.search = new URLSearchParams({ site, path, locale, version }).toString();
  return new Request(key);
}
