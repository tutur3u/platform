import { createBridgeStartHandler } from '@tuturuuu/start-bridge/start/server-entry';
import { endpoints } from '../src/start-bridge/api-registry.bridge.gen';
import { createInventoryHandler } from '../src/start-bridge/handler';
import { publicAssets } from '../src/start-bridge/public-assets.bridge.gen';

export default {
  fetch: createInventoryHandler({
    start: createBridgeStartHandler(),
    endpoints,
    publicAssets,
  }),
};
