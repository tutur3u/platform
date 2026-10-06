import {
  AI_MEMORY_PRODUCTS,
  type AiMemoryProduct,
  forgetAiMemory,
  resolveAiMemoryScope,
} from '@tuturuuu/ai/memory';
import { resolveMemoryRequestContext } from './request-context';

export { GET, HEAD, PATCH } from './edit-handlers';

import { type NextRequest, NextResponse } from 'next/server';

type Params = {
  memoryId: string;
  wsId: string;
};

function normalizeProduct(value: string | null): AiMemoryProduct {
  return AI_MEMORY_PRODUCTS.includes(value as AiMemoryProduct)
    ? (value as AiMemoryProduct)
    : 'memories';
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { memoryId, wsId: rawWsId } = await params;
  const context = await resolveMemoryRequestContext(request, rawWsId);
  if (!context.ok) return context.response;

  const product = normalizeProduct(request.nextUrl.searchParams.get('product'));
  const scope = resolveAiMemoryScope({
    customId: `memory-delete-${memoryId}`,
    product,
    source: 'memory_controls',
    surface: 'memory_controls',
    userId: context.user.id,
    wsId: context.wsId,
  });

  const result = await forgetAiMemory({
    ignoreSettings: true,
    memoryId,
    scope,
  });

  if (!result.ok) {
    console.error('Failed to delete AI memory item', {
      error: result.error,
      memoryId,
      product,
      userId: context.user.id,
      wsId: context.wsId,
    });
    return NextResponse.json(
      { error: 'Failed to delete memory item' },
      { status: 500 }
    );
  }

  await context.sbAdmin.schema('private').rpc(
    'record_ai_memory_audit' as never,
    {
      p_action: 'delete',
      p_actor_user_id: context.user.id,
      p_memory_id: memoryId,
      p_metadata: { ai_memory: result.value ?? null },
      p_product: product,
      p_user_id: context.user.id,
      p_ws_id: context.wsId,
    } as never
  );

  return NextResponse.json({
    deleted: !result.skipped,
    reason: result.skipped ? result.reason : null,
  });
}
