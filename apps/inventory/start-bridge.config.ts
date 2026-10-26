import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';

export default defineBridgeAppConfig({
  mounts: {
    rootHosts: ['inventory.tuturuuu.com', 'inventory-staging.tuturuuu.com'],
    mountHosts: [],
    unknownHost: 'reject',
  },
  csp: () => "frame-ancestors 'none'",
  async wrapResponse(response, { request }) {
    const { applyResponsePolicy } = await import(
      './src/start-bridge/response-policy'
    );
    return applyResponsePolicy(request, response);
  },
});
