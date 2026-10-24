/** Only parse trusted configuration; stored avatar URLs must stay unparsed. */
export function avatarStorageOrigins(
  configured: readonly (string | undefined)[]
): string[] {
  const origins = new Set<string>();
  for (const value of configured) {
    if (!value) continue;
    try {
      const url = new URL(value);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      )
        continue;
      origins.add(url.origin);
    } catch {
      // Invalid configuration must never grant deletion authority.
    }
  }
  return [...origins];
}
