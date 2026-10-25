// App-owned start-bridge Worker options for ai: the codemod created this
// file and never overwrites it. See "Worker options" in
// apps/docs/build/devops/start-bridge-codemod.mdx.
import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';

export default defineBridgeAppConfig({
  wrapResponse(response) {
    const result = new Response(response.body, response);
    result.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return result;
  },
});
