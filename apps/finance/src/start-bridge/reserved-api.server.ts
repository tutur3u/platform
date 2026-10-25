import { forwardToCentralApi } from '@tuturuuu/start-bridge/api-forward';
import { retarget } from '@tuturuuu/start-bridge/base-path';
import {
  type BridgeEndpoint,
  sortEndpoints,
} from '@tuturuuu/start-bridge/endpoints';
import { createTuturuuuWebWorkspaceApiRewrites } from '@tuturuuu/utils/next-config';
import type { NextRequest } from 'next/server';

export function financeEndpoints({
  local,
  origin,
  fetcher,
}: {
  local: readonly BridgeEndpoint[];
  origin: string;
  fetcher?: typeof fetch;
}): readonly BridgeEndpoint[] {
  const forward = (request: NextRequest) => {
    const url = new URL(request.url);
    url.pathname = request.nextUrl.pathname;
    return forwardToCentralApi(retarget(request, url), origin, { fetcher });
  };
  const module = {
    GET: forward,
    HEAD: forward,
    POST: forward,
    PUT: forward,
    PATCH: forward,
    DELETE: forward,
    OPTIONS: forward,
  };
  const reserved = createTuturuuuWebWorkspaceApiRewrites(origin).map(
    ({ source }) => ({
      pattern: source.replace(/:([a-zA-Z][a-zA-Z0-9_]*)/g, '[$1]'),
      module,
    })
  );
  return sortEndpoints([...reserved, ...local]);
}
