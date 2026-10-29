import { withinDeadline } from './processors/deadline';
import {
  isWebJob,
  type WebGateAction,
  type WebJobId,
  type webGateAction,
} from './web-gate';

export type WebGateRpc = (
  job: WebJobId,
  action: WebGateAction
) => Promise<ReturnType<typeof webGateAction>>;
export interface WebGateEnv {
  CRON_CONTROL_WEB_GATE_TOKEN?: string;
  CRON_CONTROL_OPERATOR_TOKEN?: string;
}
function equal(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function parse(body: unknown): WebGateAction | null {
  if (!body || typeof body !== 'object' || !('kind' in body)) return null;
  const id =
    'id' in body &&
    typeof body.id === 'string' &&
    /^[a-zA-Z0-9-]{16,64}$/.test(body.id)
      ? body.id
      : null;
  const owner =
    'owner' in body && (body.owner === 'vercel' || body.owner === 'cloudflare')
      ? body.owner
      : null;
  switch (body.kind) {
    case 'stop':
    case 'resume':
    case 'status':
      return { kind: body.kind };
    case 'owner':
      return owner ? { kind: 'owner', owner } : null;
    case 'complete':
    case 'resolve':
      return id ? { kind: body.kind, id } : null;
    case 'acquire':
      return id && owner && 'slot' in body && typeof body.slot === 'number'
        ? { kind: 'acquire', id, owner, slot: body.slot }
        : null;
    default:
      return null;
  }
}
export async function handleWebGate(
  request: Request,
  env: WebGateEnv,
  rpc: WebGateRpc
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (
    !path.startsWith('/web-crons/') &&
    !path.startsWith('/control/web-crons/')
  )
    return null;
  const operator = path.startsWith('/control/');
  const token = operator
    ? env.CRON_CONTROL_OPERATOR_TOKEN
    : env.CRON_CONTROL_WEB_GATE_TOKEN;
  const match = /^\/(?:control\/)?web-crons\/([a-z0-9-]+)$/.exec(path);
  if (
    !match ||
    !isWebJob(match[1]) ||
    request.method !== 'POST' ||
    !token ||
    token.length < 32 ||
    !equal(request.headers.get('authorization') ?? '', `Bearer ${token}`)
  )
    return new Response(null, { status: 404 });
  // Stream-bound the body, even when Content-Length is absent or dishonest.
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const clock = { deadline: Date.now() + 10_000, now: () => Date.now() };
  let text = '';
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await withinDeadline(clock, () => reader.read());
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2048) return new Response(null, { status: 413 });
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const action = parse(JSON.parse(text));
    if (
      !action ||
      (!operator && action.kind !== 'acquire' && action.kind !== 'complete')
    )
      return new Response(null, { status: 400 });
    const job = match[1];
    const result = await withinDeadline(clock, () => rpc(job, action));
    // Processor callers do not need active operation identities or control state.
    return Response.json(
      operator ? result : { ok: result.ok, reason: result.reason },
      {
        status: result.ok ? 200 : 409,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch {
    return new Response(null, { status: 503 });
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}
