import {
  channelTicketSchema,
  channelTopicSchema,
} from '@tuturuuu/realtime/channels';
import { signRealtimePayload } from '@tuturuuu/realtime/core/token';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { authorize } from '@/app/api/v1/workspaces/[wsId]/finance/bill-splits/access';
import { billSplitStore } from '@/app/api/v1/workspaces/[wsId]/finance/bill-splits/store';
import {
  billSplitRealtimeAllowed,
  billSplitRealtimeEnabled,
  parseBillSplitTopic,
} from '@/lib/finance/bill-splits/realtime';
import {
  channelEndpoint,
  noStore,
  realtimeAuth,
  realtimeUnavailable,
} from '../route-utils';
export const POST = withSessionAuth(async (request, context) => {
  const { user } = context;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400, headers: noStore }
    );
  }
  const parsed = z
    .object({ topic: channelTopicSchema })
    .strict()
    .safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Invalid topic' },
      { status: 400, headers: noStore }
    );
  let role: unknown;
  if (parsed.data.topic.startsWith('finance-bill-split:')) {
    const scope = parseBillSplitTopic(parsed.data.topic);
    if (!billSplitRealtimeEnabled() || !scope) return realtimeUnavailable();
    const access = await authorize(
      request,
      context,
      scope.wsId,
      'view_transactions'
    );
    if (access.response) return access.response;
    if (
      access.wsId !== scope.wsId ||
      !(await billSplitRealtimeAllowed(access.wsId))
    )
      return realtimeUnavailable();
    const store = billSplitStore(await createAdminClient({ noCookie: true }));
    const result = await store.rpc('read_finance_bill_splits', {
      p_ws_id: access.wsId,
      p_actor_id: access.actorId,
      p_id: scope.splitId,
    });
    if (result.error) return realtimeUnavailable();
    role =
      Array.isArray(result.data) && result.data.length === 1 ? 'viewer' : null;
  } else {
    const admin = await createAdminClient({ noCookie: true });
    const transport = admin as unknown as {
      schema(name: string): {
        rpc(
          name: string,
          args: Record<string, unknown>
        ): Promise<{ data: unknown; error: unknown }>;
      };
    };
    const { data, error } = await transport
      .schema('private')
      .rpc('cloudflare_channel_role', {
        p_actor: user.id,
        p_topic: parsed.data.topic,
      });
    if (error) return realtimeUnavailable();
    role = data;
  }
  if (role !== 'editor' && role !== 'viewer')
    return NextResponse.json(
      { error: 'Access denied' },
      { status: 403, headers: noStore }
    );
  try {
    const ticket = channelTicketSchema.parse({
      aud: 'tuturuuu.channels',
      kind: 'join',
      topic: parsed.data.topic,
      userId: user.id,
      role,
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    return NextResponse.json(
      {
        endpoint: channelEndpoint(),
        role,
        token: signRealtimePayload(
          ticket,
          process.env.MEET_REALTIME_TOKEN_SECRET
        ),
        user: {
          id: user.id,
          email: user.email,
          user_metadata: user.user_metadata ?? {},
        },
      },
      { headers: noStore }
    );
  } catch {
    return realtimeUnavailable();
  }
}, realtimeAuth);
