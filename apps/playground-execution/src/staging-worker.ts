import { authenticated } from './protocol';
import type { Env } from './environment';
import worker from './worker';

// The staging entry: the production Worker plus the fixture-only qualifier.
// Production builds from ./worker, so neither the qualifier class nor its
// route reaches the production bundle.
export {
  PlaygroundChecker,
  PlaygroundCoordinator,
  PlaygroundSlot,
} from './worker';
export { PlaygroundQualifier } from './qualifier';

const json = (body: object, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Hosted qualification. Without the staging flag and binding the route is
// indistinguishable from any unknown path.
async function qualify(request: Request, env: Env) {
  if (
    request.method !== 'POST' ||
    env.PLAYGROUND_QUALIFY !== 'enabled' ||
    !env.PLAYGROUND_QUALIFIER
  ) {
    return json({ error: 'Not found' }, 404);
  }
  if (!authenticated(request, env.PLAYGROUND_OPERATOR_SECRET)) {
    return json({ error: 'Unauthorized' }, 401);
  }
  try {
    const report =
      await env.PLAYGROUND_QUALIFIER.getByName('qualification').qualify();
    if (!report) return json({ code: 'qualification_running' }, 409);
    return json(report, report.passed ? 200 : 422);
  } catch {
    console.warn('Playground qualification failed to run');
    return json({ code: 'qualification_unavailable' }, 503);
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    if (new URL(request.url).pathname === '/qualify')
      return qualify(request, env);
    return worker.fetch(request, env);
  },
} satisfies ExportedHandler<Env>;
