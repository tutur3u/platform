export const MAX_VERCEL_CACHE_TAGS = 128;

function normalizeEntityTag(value: string) {
  return value.trim().replace(/^W\//i, '');
}

export function ifNoneMatchMatches(
  headerValue: string | null,
  responseEtag: string
) {
  if (!headerValue) return false;
  const normalizedResponse = normalizeEntityTag(responseEtag);
  return headerValue.split(',').some((candidate) => {
    const trimmed = candidate.trim();
    return (
      trimmed === '*' || normalizeEntityTag(trimmed) === normalizedResponse
    );
  });
}
