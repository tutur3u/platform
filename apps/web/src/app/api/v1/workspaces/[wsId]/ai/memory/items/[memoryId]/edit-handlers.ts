import {
  AI_MEMORY_PRODUCTS,
  type AiMemoryEditResult,
  type AiMemoryProduct,
  editAiMemory,
  readAiMemoryForEdit,
  resolveAiMemoryScope,
} from '@tuturuuu/ai/memory';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { resolveMemoryRequestContext } from './request-context';
export type MemoryParams = { memoryId: string; wsId: string };
function productFor(request: NextRequest): AiMemoryProduct | null {
  const value = request.nextUrl.searchParams.get('product') ?? 'memories';
  return AI_MEMORY_PRODUCTS.includes(value as AiMemoryProduct)
    ? (value as AiMemoryProduct)
    : null;
}
function failure(result: Extract<AiMemoryEditResult, { ok: false }>) {
  const status =
    result.reason === 'invalid_input'
      ? 400
      : result.reason === 'not_found'
        ? 404
        : result.reason === 'conflict'
          ? 409
          : result.reason === 'not_configured'
            ? 503
            : result.reason === 'disabled'
              ? 403
              : 502;
  return NextResponse.json(
    { error: 'Memory request failed', reason: result.reason },
    { status }
  );
}
function projection(
  memory: Extract<AiMemoryEditResult, { ok: true }>['memory']
) {
  return { id: memory.id, content: memory.content, revision: memory.revision };
}
async function authorized(request: NextRequest, params: Promise<MemoryParams>) {
  const { wsId, memoryId } = await params;
  const context = await resolveMemoryRequestContext(request, wsId);
  if (!context.ok) return context;
  const product = productFor(request);
  if (!product || !memoryId.trim())
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Invalid memory request' },
        { status: 400 }
      ),
    };
  const scope = resolveAiMemoryScope({
    product,
    source: 'memory_controls',
    surface: 'memory_controls',
    userId: context.user.id,
    wsId: context.wsId,
  });
  return { ...context, memoryId, product, scope };
}
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<MemoryParams> }
) {
  await connection();
  const context = await authorized(request, params);
  if (!context.ok) return context.response;
  const result = await readAiMemoryForEdit({
    scope: context.scope,
    memoryId: context.memoryId,
  });
  return result.ok
    ? NextResponse.json(
        { memory: projection(result.memory) },
        { headers: { 'Cache-Control': 'private, no-store' } }
      )
    : failure(result);
}
export async function HEAD(
  request: NextRequest,
  context: { params: Promise<MemoryParams> }
) {
  const response = await GET(request, context);
  return new NextResponse(null, {
    status: response.status,
    headers: response.headers,
  });
}
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<MemoryParams> }
) {
  const context = await authorized(request, params);
  if (!context.ok) return context.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid memory request' },
      { status: 400 }
    );
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return NextResponse.json(
      { error: 'Invalid memory request' },
      { status: 400 }
    );
  const data = body as Record<string, unknown>;
  if (
    Object.keys(data).some((key) => key !== 'value' && key !== 'revision') ||
    typeof data.value !== 'string' ||
    !data.value.trim() ||
    data.value.length > 20000 ||
    typeof data.revision !== 'string' ||
    !/^v1:[a-f0-9]{32}$/.test(data.revision)
  )
    return NextResponse.json(
      { error: 'Invalid memory request' },
      { status: 400 }
    );
  // Explicit owner management remains available with collection disabled.
  const result = await editAiMemory({
    scope: context.scope,
    memoryId: context.memoryId,
    revision: data.revision,
    value: data.value,
    ignoreSettings: true,
  });
  if (!result.ok) return failure(result);
  let auditRecorded = false;
  try {
    const audit: unknown = await context.sbAdmin.schema('private').rpc(
      'record_ai_memory_audit' as never,
      {
        p_action: 'edit',
        p_actor_user_id: context.user.id,
        p_user_id: context.user.id,
        p_ws_id: context.wsId,
        p_product: context.product,
        p_memory_id: context.memoryId,
        p_metadata: {
          previousRevision: data.revision,
          revision: result.memory.revision,
        },
      } as never
    );
    auditRecorded =
      !!audit &&
      typeof audit === 'object' &&
      'error' in audit &&
      !audit.error &&
      'data' in audit &&
      typeof audit.data === 'string' &&
      !!audit.data;
  } catch {
    /* The durable edit is already confirmed; never imply rollback. */
  }
  return NextResponse.json({
    updated: true,
    memory: projection(result.memory),
    auditRecorded,
    warning: auditRecorded ? null : 'audit_failed',
  });
}
