import { type NextRequest, NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { resolveChatRouteContext } from '@/lib/chat/private-rpc';
import { externalChatSettingsSchema } from '@/lib/external-chat/schemas';
import {
  readExternalChatBinding,
  serializeExternalChatBinding,
  writeExternalChatSettings,
} from '@/lib/external-chat/store';

type Params = { wsId: string };

export const GET = withSessionAuth<Params>(
  async (_request, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'manage_external_projects',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;
    return NextResponse.json(
      serializeExternalChatBinding(
        await readExternalChatBinding(context.context.normalizedWsId)
      )
    );
  },
  { allowAppSessionAuth: true, rateLimitKind: 'read' }
);

export const PATCH = withSessionAuth<Params>(
  async (request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'manage_external_projects',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;
    const parsed = externalChatSettingsSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid settings', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    await writeExternalChatSettings(
      context.context.normalizedWsId,
      parsed.data,
      auth.user.id
    );
    return NextResponse.json(
      serializeExternalChatBinding(
        await readExternalChatBinding(context.context.normalizedWsId)
      )
    );
  },
  { allowAppSessionAuth: true, rateLimitKind: 'mutate' }
);
