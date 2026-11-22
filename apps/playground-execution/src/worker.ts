import { z } from 'zod';
import { coordinator, type Env } from './environment';
import {
  authenticated,
  readBoundedJson,
  RunIdentity,
  RunLookup,
  RunSubmission,
  RunWriteback,
} from './protocol';

export { PlaygroundCoordinator } from './coordinator';
export { PlaygroundSlot } from './slot';

const Stop = RunIdentity.extend({ runId: z.uuid().optional() });
const Control = z.strictObject({ enabled: z.boolean() });
const REJECTED = { error: 'Invalid Playground request' };
const writeback = new Map<string, 'verify' | 'claim' | 'settle'>([
  ['/writeback/verify', 'verify'],
  ['/writeback/claim', 'claim'],
  ['/writeback/settle', 'settle'],
] as const);
const routes = new Set([
  '/run',
  '/result',
  '/stop',
  '/control',
  ...writeback.keys(),
]);
const json = (body: object, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export default {
  async fetch(request, env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method !== 'POST' || !routes.has(path)) {
      return json({ error: 'Not found' }, 404);
    }
    const secret =
      path === '/control'
        ? env.PLAYGROUND_OPERATOR_SECRET
        : env.PLAYGROUND_INGRESS_SECRET;
    if (!authenticated(request, secret)) {
      return json({ error: 'Unauthorized' }, 401);
    }
    let body: unknown;
    try {
      body = await readBoundedJson(request, 400_000);
    } catch {
      return json(REJECTED, 400);
    }
    const service = coordinator(env);
    try {
      if (path === '/run') {
        const input = RunSubmission.safeParse(body);
        if (!input.success) return json(REJECTED, 400);
        const admission = await service.enqueue(input.data);
        if (admission.kind === 'accepted')
          return json(
            { runId: admission.runId, startedAt: admission.startedAt },
            202
          );
        const code = admission.reason;
        const status =
          code === 'execution_paused'
            ? 503
            : code === 'request_conflict'
              ? 409
              : 429;
        return json({ code }, status);
      }
      if (path === '/result') {
        const input = RunLookup.safeParse(body);
        if (!input.success) return json(REJECTED, 400);
        const result = await service.read(input.data);
        return result ? json(result) : json({ error: 'Run not found' }, 404);
      }
      if (path === '/stop') {
        const input = Stop.safeParse(body);
        if (!input.success) return json(REJECTED, 400);
        const result = await service.stop(input.data);
        return result
          ? json(result, 202)
          : json({ error: 'Run not found' }, 404);
      }
      const writebackAction = writeback.get(path);
      if (writebackAction) {
        const input = RunWriteback.safeParse(body);
        if (!input.success) return json(REJECTED, 400);
        const accepted = await service.writeback(input.data, writebackAction);
        return json({ accepted }, accepted ? 200 : 409);
      }
      const input = Control.safeParse(body);
      if (!input.success) return json(REJECTED, 400);
      const state = await service.gate(input.data.enabled);
      const status =
        state.enabled !== input.data.enabled
          ? 409
          : !state.enabled && state.active > 0
            ? 202
            : 200;
      return json(state, status);
    } catch {
      console.warn('Playground Worker request failed');
      return json({ code: 'execution_unavailable' }, 503);
    }
  },
} satisfies ExportedHandler<Env>;
