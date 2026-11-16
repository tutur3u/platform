import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';

export default defineBridgeAppConfig({
  mounts: {
    rootHosts: ['nova.tuturuuu.com', 'nova.ai.vn', 'nova.tutur3u.com'],
    mountHosts: ['tuturuuu.com'],
    basePath: '/nova',
    unknownHost: 'reject',
  },
  async wrapResponse(response, { request }) {
    const { stampNovaWorkerBuildInfo } =
      await import('./cloudflare/worker-build-info');
    const stamped = await stampNovaWorkerBuildInfo(request, response);
    const { applyResponsePolicy } =
      await import('./src/start-bridge/response-policy');
    return applyResponsePolicy(request, stamped);
  },
});
