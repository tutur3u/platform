import { createHash, timingSafeEqual } from 'node:crypto';
import { coordinationRequestSchema } from '../../../packages/utils/src/coordination-protocol';
import { CoordinationObject } from './object';

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
async function boundedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Empty body');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) throw new Error('Body too large');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally {
    await reader.cancel();
  }
}
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
      input = coordinationRequestSchema.parse(await boundedBody(request));
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
