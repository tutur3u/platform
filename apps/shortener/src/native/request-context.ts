import {
  bridgeRequest,
  createRequestLocal,
  withBridgeRequest,
} from '@tuturuuu/start-bridge/request-context';
import type { ShortLinkPage } from '../link/resolve';

export {
  appendContextCookies,
  cookies,
  headers,
} from '@tuturuuu/start-bridge/request-context';

const page = createRequestLocal<ShortLinkPage | null>('shortener page');

/** Carries the Worker-resolved page model into Start SSR for one request. */
export function withRequestContext<T>(request: Request, work: () => T) {
  return withBridgeRequest(request, work);
}
export const requestContext = bridgeRequest;
export function setContextPage(value: ShortLinkPage | null) {
  page.set(value);
}
export function contextPage(): ShortLinkPage | null {
  return page.get() ?? null;
}
