import historyUrl from '../generated/history.json?url';

/**
 * The hashed full-history JSON. The timeline fetches it lazily; the roadmap
 * head also links it as the page's machine-readable alternate (no fetch).
 * The canonical smoke reads both the entry and deferred route chunks to find
 * the URL, since the bundler can move it into a shared chunk.
 */
export { historyUrl };

/** `<link rel="alternate" type="application/json">`: never fetched. */
export function historyAlternateLink() {
  return {
    rel: 'alternate',
    type: 'application/json',
    href: historyUrl,
    title: 'Roadmap history',
  };
}
