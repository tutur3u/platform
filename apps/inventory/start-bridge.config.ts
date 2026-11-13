import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';

export default defineBridgeAppConfig({
  mounts: {
    rootHosts: ['inventory.tuturuuu.com', 'inventory.tutur3u.com'],
    // One artifact: the subdomain roots and the tuturuuu.com/inventory mount.
    mountHosts: ['tuturuuu.com'],
    basePath: '/inventory',
    unknownHost: 'reject',
  },
  async wrapResponse(response, { request }) {
    const { applyResponsePolicy } =
      await import('./src/start-bridge/response-policy');
    return applyResponsePolicy(request, response);
  },
});
