import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { resolveChatRouteContext } from '@/lib/chat/private-rpc';

type Params = { conversationId: string; wsId: string };

export const GET = withSessionAuth<Params>(
  async (_request: NextRequest, auth, params) => {
    await connection();
    const context = await resolveChatRouteContext({
      auth,
      permission: 'view_chat',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;
    const admin = await createAdminClient({ noCookie: true });
    const db = admin.schema('private') as any;
    const { data: thread, error: threadError } = await db
      .from('external_chat_threads')
      .select('id, metadata, created_at, updated_at')
      .eq('ws_id', context.context.normalizedWsId)
      .eq('conversation_id', params.conversationId)
      .maybeSingle();
    if (threadError)
      return NextResponse.json(
        { error: 'context_unavailable' },
        { status: 503 }
      );
    if (!thread)
      return NextResponse.json({ error: 'thread_not_found' }, { status: 404 });

    const { data: observations, error } = await db
      .from('external_chat_observations')
      .select('category, payload, occurred_at')
      .eq('ws_id', context.context.normalizedWsId)
      .eq('thread_id', thread.id)
      .order('occurred_at', { ascending: false })
      .limit(100);
    if (error)
      return NextResponse.json(
        { error: 'context_unavailable' },
        { status: 503 }
      );

    return NextResponse.json(serializeContext(thread, observations ?? []), {
      headers: { 'Cache-Control': 'no-store' },
    });
  },
  { allowAppSessionAuth: { targetApp: ['chat', 'cms'] }, rateLimitKind: 'read' }
);

function serializeContext(
  thread: {
    created_at: string;
    metadata: Record<string, unknown>;
    updated_at: string;
  },
  observations: Array<{
    category: string;
    occurred_at: string;
    payload: Record<string, unknown>;
  }>
) {
  const profile = observations.find(
    (item) => item.category === 'profile_context'
  );
  const payload = profile?.payload ?? {};
  return {
    firstActivityAt: thread.created_at,
    lastActivityAt: observations[0]?.occurred_at ?? thread.updated_at,
    networkHint: maskNetwork(readNestedString(payload, 'network', 'address')),
    profile: {
      displayName:
        readString(payload.displayName) ??
        readString(thread.metadata.displayName),
      email: readString(payload.email) ?? readString(thread.metadata.email),
      phone: readString(payload.phone) ?? readString(thread.metadata.phone),
    },
    routes: observations
      .filter((item) => item.category === 'route_activity')
      .map((item) => ({
        location: readString(item.payload.location),
        occurredAt: item.occurred_at,
      }))
      .filter((item) => item.location),
  };
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNestedString(
  value: Record<string, unknown>,
  parent: string,
  child: string
) {
  const nested = value[parent];
  return nested && typeof nested === 'object'
    ? readString((nested as Record<string, unknown>)[child])
    : null;
}

function maskNetwork(value: string | null) {
  if (!value) return null;
  if (value.includes('.')) {
    const parts = value.split('.');
    return parts.length === 4
      ? `${parts.slice(0, 3).join('.')}.masked`
      : 'masked';
  }
  if (value.includes(':')) return `${value.split(':')[0]}:masked`;
  return 'masked';
}
