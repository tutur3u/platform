import { createApiPath } from '@tuturuuu/start-bridge/app-url';
import { appApiPatterns } from '../start-bridge/api-patterns.bridge.gen';
import { centralFirst } from '../start-bridge/central-first';

/**
 * App-owned API paths gain the document mount (`/nova/api/...` on
 * tuturuuu.com/nova). Paths this app does not own stay root-relative so the
 * gateway sends them to Web.
 */
export const appApiPath = createApiPath(appApiPatterns, centralFirst);

export function mountedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const target = typeof input === 'string' ? appApiPath(input) : input;
  return init === undefined ? fetch(target) : fetch(target, init);
}
