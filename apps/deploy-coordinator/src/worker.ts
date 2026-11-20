import { DeployEnvironment } from './environment-object';
import { handle } from './http';
import { githubKeySource } from './oidc';

export { DeployEnvironment };

type Env = {
  DEPLOY_COORDINATOR_ENABLED?: string;
  DEPLOY_COORDINATOR_OIDC_AUDIENCE: string;
  DEPLOY_COORDINATOR_REPOSITORY_ID: string;
  DEPLOY_COORDINATOR_OPERATOR_TOKEN?: string;
  DEPLOY_ENVIRONMENTS: DurableObjectNamespace<DeployEnvironment>;
};

// Shared per isolate: GitHub's signing keys change rarely.
const keys = githubKeySource(async (url) => {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5_000),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`JWKS fetch failed: ${response.status}`);
  return response.json();
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, {
        enabled: env.DEPLOY_COORDINATOR_ENABLED === 'true',
        audience: env.DEPLOY_COORDINATOR_OIDC_AUDIENCE,
        repositoryId: env.DEPLOY_COORDINATOR_REPOSITORY_ID,
        operatorToken: env.DEPLOY_COORDINATOR_OPERATOR_TOKEN,
        keys,
        now: Date.now,
        call: async (name, context, operation) =>
          env.DEPLOY_ENVIRONMENTS.get(
            env.DEPLOY_ENVIRONMENTS.idFromName(name)
          ).call(context, operation),
      });
    } catch (caught) {
      console.error('Deploy coordinator request failed', caught);
      return Response.json(
        { error: 'INTERNAL', message: 'Internal error' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }
  },
};
