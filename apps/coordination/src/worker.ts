import { createHash, timingSafeEqual } from 'node:crypto';
import { coordinationRequestSchema } from '../../../packages/utils/src/coordination-protocol';
import { CoordinationObject } from './object';
import { coordinationBody } from './request-body';

export { CoordinationObject };

interface Env {
  COORDINATION: DurableObjectNamespace<CoordinationObject>;
  COORDINATION_TOKEN: string;
}
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET')
      return json({ ok: true });
    if (url.pathname !== '/v1/coordinate' || request.method !== 'POST')
      return json({ error: 'Not found' }, 404);
    if (!env.COORDINATION_TOKEN || env.COORDINATION_TOKEN.length < 32)
      return json({ error: 'Unavailable' }, 503);
    const actual = createHash('sha256')
      .update(request.headers.get('authorization') ?? '')
      .digest();
    const expected = createHash('sha256')
      .update(`Bearer ${env.COORDINATION_TOKEN}`)
      .digest();
    if (!timingSafeEqual(actual, expected))
      return json({ error: 'Unauthorized' }, 401);
    let input: ReturnType<typeof coordinationRequestSchema.parse>;
    try {
      input = coordinationRequestSchema.parse(await coordinationBody(request));
    } catch {
      return json({ error: 'Invalid request' }, 400);
    }
    try {
      const object = env.COORDINATION.getByName(
        `${input.namespace}:${input.key}`
      );
      return json(await object.execute(input));
    } catch {
      console.error('Coordination operation failed');
      return json({ error: 'Unavailable' }, 503);
    }
  },
} satisfies ExportedHandler<Env>;
