// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: server-only Release Desk configuration.
import { connection } from 'next/server';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';
import { forwardOpsHubRequest } from '@/lib/ops-hub/gateway';

async function handle(request: Request) {
  await connection();
  return forwardOpsHubRequest(request, {
    authorize: async (incoming) => {
      try {
        const result = await authorizeInfrastructureAdminRequest(
          'view_infrastructure',
          true,
          incoming
        );
        return result.ok ? result.user.id : null;
      } catch {
        return null;
      }
    },
    config: () => ({
      workerUrl: process.env.OPS_HUB_WORKER_URL,
      gatewaySecret: process.env.OPS_HUB_GATEWAY_SECRET,
      allowedUserIds: process.env.OPS_HUB_ALLOWED_USER_IDS,
    }),
    fetch,
  });
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
};
