/** Public documents available on the canonical host in both languages. */
export const PUBLIC_DOCUMENT_PATHS = [
  '/roadmap',
  '/roadmap/vi',
  '/roadmap/workshops/edufest-2026',
  '/roadmap/vi/workshops/edufest-2026',
];

/** A bare query and a tracking query must both reach the same document. */
export const QUERY_DOCUMENT_PATHS = PUBLIC_DOCUMENT_PATHS.slice(0, 2).flatMap(
  (path) => [`${path}?x=1`, `${path}?utm_source=roadmap-smoke&utm_medium=test`]
);

export const DOCUMENT_REQUEST_PATHS = [
  ...PUBLIC_DOCUMENT_PATHS,
  ...QUERY_DOCUMENT_PATHS,
];
