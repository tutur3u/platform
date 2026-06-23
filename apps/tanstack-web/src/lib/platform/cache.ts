export const PUBLIC_MODEL_DIRECTORY_CACHE_HEADERS = {
  'Cache-Control':
    'public, max-age=300, s-maxage=900, stale-while-revalidate=3600',
  'CDN-Cache-Control': 'max-age=900',
} as const;

export const MODEL_DIRECTORY_FALLBACK_CACHE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
} as const;

export const PUBLIC_CHANGELOG_CACHE_HEADERS = {
  'Cache-Control':
    'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
  'CDN-Cache-Control': 'max-age=300',
} as const;
