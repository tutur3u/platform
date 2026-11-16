import historyUrl from '../generated/history.json?url';

/**
 * The hashed full-history JSON. The timeline fetches it lazily; the roadmap
 * head also links it as the page's machine-readable alternate (no fetch).
 * Because the head imports it, the URL lives in the entry chunk, where the
 * canonical smoke (which scans the page's scripts) finds and checks it.
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
