import type { PasswordsEnvironment } from '../src/service/environment';
import type {
  PasswordsRuntime,
  PasswordsServicePort,
} from '../src/service/port';
import { fenceService, isPasswordsEnabled } from '../src/service/stop-fence';
import { withSecurityHeaders } from './security-headers';

const staticFiles = new Set(['/favicon.ico', '/site.webmanifest']);

export interface PasswordsRequestDependencies {
  buildInfo(request: Request): Response | null;
  createRuntime(env: PasswordsEnvironment): PasswordsRuntime;
  renderPage(request: Request): Promise<Response>;
  withContext<T>(
    context: { request: Request; service: PasswordsServicePort },
    work: () => Promise<T>
  ): Promise<T>;
}

function isStaticRequest(request: Request, path: string) {
  return (
    (request.method === 'GET' || request.method === 'HEAD') &&
    (path.startsWith('/assets/') || staticFiles.has(path))
  );
}

export function stoppedResponse() {
  return withSecurityHeaders(
    Response.json({ code: 'STOPPED' }, { status: 503 })
  );
}

/**
 * Order matters: static files and build identity touch no vault state. The stop
 * fence is checked next, before the runtime exists, so a disabled Worker makes no
 * session, database, storage or token-exchange call and schedules nothing.
 */
export async function passwordsRequest(
  request: Request,
  env: PasswordsEnvironment,
  deps: PasswordsRequestDependencies
) {
  const path = new URL(request.url).pathname;
  if (isStaticRequest(request, path)) return env.ASSETS.fetch(request);

  const identity = deps.buildInfo(request);
  if (identity) return withSecurityHeaders(identity);

  if (!isPasswordsEnabled(env)) return stoppedResponse();

  const runtime = deps.createRuntime(env);
  const secrets = await runtime.secrets.handle(request);
  if (secrets) return withSecurityHeaders(secrets);

  const edge = await runtime.edge.handle(request);
  if (edge) return withSecurityHeaders(edge);

  const service = fenceService(runtime.service(request), () =>
    isPasswordsEnabled(env)
  );
  return withSecurityHeaders(
    await deps.withContext({ request, service }, () => deps.renderPage(request))
  );
}
