import handler from '@tanstack/react-start/server-entry';
import { fetchAsset } from '@tuturuuu/start-bridge/assets';
import type { MastermindEnvironment } from '../src/native/auth';
import { withOwner } from '../src/native/context';
import { mastermindRequest } from '../src/native/request';
export default {
  fetch(request: Request, env: MastermindEnvironment) {
    return mastermindRequest(request, env, (input, owner) => {
      const path = new URL(input.url).pathname;
      if (path === '/' || path === '/mastermind' || path === '/mastermind/') {
        return new Response(null, {
          status: 303,
          headers: {
            Location: path.startsWith('/mastermind') ? '/mastermind/en' : '/en',
          },
        });
      }
      if (/^(?:\/mastermind)?\/assets\//.test(path) && env.ASSETS) {
        return fetchAsset(env.ASSETS, input);
      }
      return withOwner(input, owner, () => handler.fetch(input));
    });
  },
};

export type { MastermindEnvironment } from '../src/native/auth';
