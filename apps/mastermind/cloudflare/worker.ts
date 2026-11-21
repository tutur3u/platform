import handler from '@tanstack/react-start/server-entry';
import { fetchAsset } from '@tuturuuu/start-bridge/assets';
import { createNonce } from '@tuturuuu/start-bridge/csp';
import {
  assertMastermindEnvironment,
  type MastermindEnvironment,
} from '../src/native/auth';
import { withOwner } from '../src/native/context';
import { mastermindRequest, secure } from '../src/native/request';
export default {
  fetch(request: Request, env: MastermindEnvironment) {
    try {
      assertMastermindEnvironment(env);
    } catch {
      return secure(new Response('Service unavailable', { status: 503 }));
    }
    // One nonce per response: the CSP header and every rendered script share it.
    const nonce = createNonce();
    return mastermindRequest(
      request,
      env,
      (input, owner, mount) => {
        const path = new URL(input.url).pathname;
        if (path === `${mount.basePath}/` || path === (mount.basePath || '/')) {
          return new Response(null, {
            status: 303,
            headers: { Location: `${mount.basePath}/en` },
          });
        }
        if (path.startsWith(`${mount.basePath}/assets/`) && env.ASSETS) {
          return fetchAsset(env.ASSETS, input);
        }
        return withOwner(input, owner, () => handler.fetch(input), {
          nonce,
          appBase: mount.basePath,
        });
      },
      Date.now(),
      nonce
    );
  },
};

export type { MastermindEnvironment } from '../src/native/auth';
