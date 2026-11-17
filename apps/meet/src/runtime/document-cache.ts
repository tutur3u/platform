import { meetRequest } from './request-context';

export const SIGNED_IN_DOCUMENT_CACHE_CONTROL = 'private, no-store';

/**
 * Call as soon as a session actor has been read for the request. The header
 * rides the request's shared response headers, which the proxy bridge applies
 * to whatever response the request ends with (document, redirect or error), so
 * a browser or intercepting proxy never stores signed-in HTML. Requests without
 * an actor never call this and keep the headers Start set.
 */
export function markSignedInDocument() {
  meetRequest().responseHeaders.set(
    'Cache-Control',
    SIGNED_IN_DOCUMENT_CACHE_CONTROL
  );
}
