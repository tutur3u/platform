type AppUrlCandidate = string | null | undefined;

interface ResolveAppUrlOptions {
  candidates: readonly AppUrlCandidate[];
  fallback: string;
}

function trimTrailingSlashes(value: string) {
  let end = value.length;

  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }

  return end === value.length ? value : value.slice(0, end);
}

function normalizeHttpUrl(value: AppUrlCandidate) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    return trimTrailingSlashes(trimmed);
  } catch {
    return null;
  }
}

export function resolveAppUrl({ candidates, fallback }: ResolveAppUrlOptions) {
  for (const candidate of candidates) {
    const resolvedUrl = normalizeHttpUrl(candidate);

    if (resolvedUrl) {
      return resolvedUrl;
    }
  }

  return normalizeHttpUrl(fallback) ?? fallback;
}
