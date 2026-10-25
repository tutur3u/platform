import { createBridgeStartHandler } from '@tuturuuu/start-bridge/start/server-entry';
import { endpoints } from '../src/start-bridge/api-registry.bridge.gen';
import { createNovaHandler } from '../src/start-bridge/handler';
import { publicAssets } from '../src/start-bridge/public-assets.bridge.gen';

export default {
  fetch: createNovaHandler({
    start: createBridgeStartHandler(),
    endpoints,
    publicAssets,
  }),
};
