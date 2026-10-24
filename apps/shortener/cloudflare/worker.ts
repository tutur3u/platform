import handler from '@tanstack/react-start/server-entry';
import { workerBuildInfo } from '@tuturuuu/utils/worker-build-info';
import bcrypt from 'bcryptjs';
import { forwardCentralApi, guardShortenerApi } from '../src/native/api.server';
import {
  appendContextCookies,
  setContextPage,
  withRequestContext,
} from '../src/native/request-context';
import {
  type ShortenerEnvironment,
  shortenerRequest,
} from '../src/native/shortener-request';
import { createSupabaseLinkStore } from '../src/native/supabase-store.server';

export type { ShortenerEnvironment };

export function shortenerWorkerRequest(
  request: Request,
  env: ShortenerEnvironment
) {
  return withRequestContext(request, async () =>
    appendContextCookies(
      await shortenerRequest(request, env, {
        store: () => createSupabaseLinkStore(),
        buildInfo: (input) => workerBuildInfo(input, 'shortener'),
        guard: guardShortenerApi,
        forwardApi: (input, origin, search) =>
          forwardCentralApi(input, origin, search),
        comparePassword: (password, hash) => bcrypt.compare(password, hash),
        renderPage: async (input, page) => {
          setContextPage(page);
          return handler.fetch(input);
        },
      })
    )
  );
}

export default { fetch: shortenerWorkerRequest };
