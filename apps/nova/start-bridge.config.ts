import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';

export default defineBridgeAppConfig({
  mounts: {
    rootHosts: ['nova.ai.vn', 'nova.staging.tutur3u.com'],
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
