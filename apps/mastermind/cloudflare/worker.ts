import handler from '@tanstack/react-start/server-entry';
import { fetchAsset } from '@tuturuuu/start-bridge/assets';
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
    return mastermindRequest(request, env, (input, owner) => {
      const path = new URL(input.url).pathname;
      if (path === '/') {
        return new Response(null, {
          status: 303,
          headers: {
            Location: '/en',
          },
        });
      }
      if (path.startsWith('/assets/') && env.ASSETS) {
        return fetchAsset(env.ASSETS, input);
      }
      return withOwner(input, owner, () => handler.fetch(input));
    });
  },
};

export type { MastermindEnvironment } from '../src/native/auth';
