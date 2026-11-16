import { withHstsResponsePolicy } from '@tuturuuu/start-bridge/response-policy';
import type { PlaygroundEnvironment } from './worker';
import bridge from './worker';
import { publicBoundary } from './public-boundary.mjs';

interface PublicEnvironment extends PlaygroundEnvironment {
  PLATFORM_BUILD_COMMIT_HASH: string;
}
interface Context {
  waitUntil(work: Promise<unknown>): void;
}

// HSTS wraps the public entry too, so boundary refusals carry it as well.
export default {
  fetch: withHstsResponsePolicy(
    async (request: Request, env: PublicEnvironment, ctx: Context) => {
      const refused = publicBoundary(request, env);
      if (refused) return refused;
      const headers = new Headers(request.headers);
      headers.delete('cookie');
      headers.delete('authorization');
      const response = await bridge.fetch(
        new Request(request, { headers }),
        env,
        ctx
      );
      const result = new Response(response.body, response);
      result.headers.delete('set-cookie');
      result.headers.set('Cache-Control', 'private, no-store');
      if (result.headers.get('Content-Type')?.includes('text/html')) {
        const url = new URL(request.url);
        const base = url.hostname === 'tuturuuu.com' ? '/playground' : '';
        result.headers.append(
          'Content-Security-Policy',
          `connect-src ${url.origin}${base}/api/build-info`
        );
      }
      return result;
    }
  ),
};
