import { createWebCandidateHandler } from './handler';
import { stagingProfile, type WebCandidateEnv } from './profile';
import { assertRequiredWebSecrets } from './required-secrets';
import { staticStartHandler } from './start/static-handler';

const handler = createWebCandidateHandler({ start: staticStartHandler });

export default {
  fetch(request: Request, env: WebCandidateEnv) {
    try {
      assertRequiredWebSecrets(env);
    } catch {
      return new Response('Web runtime configuration unavailable', {
        status: 503,
        headers: {
          'cache-control': 'no-store',
          'cdn-cache-control': 'no-store',
          'strict-transport-security': stagingProfile.hsts,
          'x-robots-tag': 'noindex, nofollow',
        },
      });
    }
    return handler(request, env);
  },
};
