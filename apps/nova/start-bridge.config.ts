import {
  defineBridgeAppConfig,
  withDocumentSecurity,
} from '@tuturuuu/start-bridge/start/app-config';

import { deploymentMountHosts } from './cloudflare/deployment-profile.ts';

export default defineBridgeAppConfig(
  withDocumentSecurity('nova', {
    mounts: {
      rootHosts: ['nova.tuturuuu.com', 'nova.ai.vn', 'nova.tutur3u.com'],
      mountHosts: deploymentMountHosts(
        import.meta.env?.VITE_NOVA_NATIVE_PROFILE ??
          process.env.VITE_NOVA_NATIVE_PROFILE
      ),
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
  })
);
