// App-owned start-bridge Worker options for marketing: the codemod created this
// file and never overwrites it. See "Worker options" in
// apps/docs/build/devops/start-bridge-codemod.mdx.
import {
  appRobots,
  createRootResponsePolicy,
} from '@tuturuuu/start-bridge/response-policy';
import { PRIVATE_ROBOTS_HEADER } from '@tuturuuu/utils/seo-robots';
import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';

const secureResponse = createRootResponsePolicy({
  seo: appRobots,
});

export default defineBridgeAppConfig({
  // Robots (the app's seo-policy.json allowlist on its canonical host),
  // framing, sniffing, referrer and private caching on every response; only
  // GET/HEAD static files keep their own caching.
  wrapResponse(response, context) {
    const originOnly =
      new URL(context.request.url).origin !== 'https://tuturuuu.com' &&
      (context.env as { TUTURUUU_NOINDEX?: string } | undefined)
        ?.TUTURUUU_NOINDEX !== '1' &&
      !response.headers.has('x-robots-tag');
    const upstreamRobots = response.headers.get('x-robots-tag');
    const secured = secureResponse(response, context);
    if (upstreamRobots && /\bnone\b/iu.test(upstreamRobots)) {
      secured.headers.set('x-robots-tag', upstreamRobots);
    }
    secured.headers.delete('x-marketing-origin-robots');
    if (
      originOnly &&
      secured.headers.get('x-robots-tag') === PRIVATE_ROBOTS_HEADER
    ) {
      secured.headers.set('x-marketing-origin-robots', '1');
    }
    return secured;
  },
});
