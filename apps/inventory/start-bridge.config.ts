import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';

export default defineBridgeAppConfig({
  mounts: {
    rootHosts: ['inventory.tuturuuu.com', 'inventory.tutur3u.com'],
    mountHosts: [],
    unknownHost: 'reject',
  },
  async wrapResponse(response, { request }) {
    const { applyResponsePolicy } = await import(
      './src/start-bridge/response-policy'
    );
    return applyResponsePolicy(request, response);
  },
});
