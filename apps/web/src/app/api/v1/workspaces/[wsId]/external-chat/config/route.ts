import { type NextRequest, NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { resolveChatRouteContext } from '@/lib/chat/private-rpc';
import { assertSafeExternalChatUrl } from '@/lib/external-chat/safe-control-request';
import { externalChatSettingsSchema } from '@/lib/external-chat/schemas';
import {
  readExternalChatBinding,
  serializeExternalChatBinding,
  writeExternalChatSettings,
} from '@/lib/external-chat/store';
import { safeParseBody } from '@/lib/safe-parse-body';

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
    const body = await safeParseBody(request, 32_768);
    if (body instanceof NextResponse) return body;
    const parsed = externalChatSettingsSchema.safeParse(body.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid settings', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const current = await readExternalChatBinding(
      context.context.normalizedWsId
    );
    if (!current) {
      return NextResponse.json({ error: 'Binding not found' }, { status: 404 });
    }
    try {
      await assertSafeExternalChatUrl(parsed.data.bridgeBaseUrl);
    } catch {
      return NextResponse.json(
        { error: 'Bridge URL is not allowed' },
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
