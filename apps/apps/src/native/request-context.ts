import {
  bridgeRequest,
  withBridgeRequest,
} from '@tuturuuu/start-bridge/request-context';

export {
  appendContextCookies,
  cookies,
  headers,
} from '@tuturuuu/start-bridge/request-context';

/** Runs Worker request handling inside the shared bridge request context. */
export function withRequestContext<T>(request: Request, work: () => T) {
  return withBridgeRequest(request, work);
}

export const requestContext = bridgeRequest;
