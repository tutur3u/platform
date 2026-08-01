import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { resolveChatRouteContext } from '@/lib/chat/private-rpc';
import {
  createIngestSecret,
  encryptControlSecret,
  hashExternalChatSecret,
  secretLastFour,
} from '@/lib/external-chat/crypto';
import {
  updateExternalChatBridgeCredential,
  verifyExternalChatControl,
} from '@/lib/external-chat/delivery';
import {
  readExternalChatBinding,
  serializeExternalChatBinding,
  upsertExternalChatCredentials,
} from '@/lib/external-chat/store';

type Params = { wsId: string };
const mutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('rotate_ingest') }),
  z.object({
    action: z.literal('set_control'),
    secret: z.string().min(24).max(512),
  }),
  z.object({ action: z.literal('clear_ingest') }),
  z.object({ action: z.literal('clear_control') }),
  z.object({ action: z.literal('verify') }),
]);

export const POST = withSessionAuth<Params>(
  async (request: NextRequest, auth, params) => {
    const context = await resolveChatRouteContext({
      auth,
      permission: 'manage_external_projects',
      wsId: params.wsId,
    });
    if (!context.ok) return context.response;
    const parsed = mutationSchema.safeParse(await request.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Invalid credential action' },
        { status: 400 }
      );

    const wsId = context.context.normalizedWsId;
    const current = await readExternalChatBinding(wsId);
    let issuedSecret: string | undefined;
    if (parsed.data.action === 'rotate_ingest') {
      issuedSecret = createIngestSecret();
      if (current?.credentials?.control_secret_encrypted) {
        try {
          await updateExternalChatBridgeCredential({
            action: 'set_ingest',
            secret: issuedSecret,
            wsId,
          });
        } catch {
          return NextResponse.json(
            {
              error: 'External chat bridge rejected credential rotation',
              state: serializeExternalChatBinding(current),
            },
            { status: 502 }
          );
        }
      }
      await upsertExternalChatCredentials(wsId, {
        ingest_secret_hash: hashExternalChatSecret(issuedSecret),
        ingest_secret_last_four: secretLastFour(issuedSecret),
        ingest_secret_rotated_at: new Date().toISOString(),
        verified_at: null,
      });
    } else if (parsed.data.action === 'set_control') {
      if (current?.credentials?.control_secret_encrypted) {
        try {
          await updateExternalChatBridgeCredential({
            action: 'rotate_control',
            secret: parsed.data.secret,
            wsId,
          });
        } catch {
          return NextResponse.json(
            {
              error: 'External chat bridge rejected credential rotation',
              state: serializeExternalChatBinding(current),
            },
            { status: 502 }
          );
        }
      }
      await upsertExternalChatCredentials(wsId, {
        control_secret_encrypted: await encryptControlSecret(
          wsId,
          parsed.data.secret
        ),
        control_secret_last_four: secretLastFour(parsed.data.secret),
        control_secret_rotated_at: new Date().toISOString(),
        verified_at: null,
      });
    } else if (parsed.data.action === 'clear_ingest') {
      await upsertExternalChatCredentials(wsId, {
        ingest_secret_hash: null,
        ingest_secret_last_four: null,
        ingest_secret_rotated_at: null,
        verified_at: null,
      });
    } else if (parsed.data.action === 'clear_control') {
      await upsertExternalChatCredentials(wsId, {
        control_secret_encrypted: null,
        control_secret_last_four: null,
        control_secret_rotated_at: null,
        verified_at: null,
      });
    } else {
      try {
        await verifyExternalChatControl(wsId);
      } catch {
        return NextResponse.json(
          {
            error: 'External chat bridge verification failed',
            state: serializeExternalChatBinding(
              await readExternalChatBinding(wsId)
            ),
          },
          { status: 502 }
        );
      }
      await upsertExternalChatCredentials(wsId, {
        verified_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      ...(issuedSecret ? { secret: issuedSecret } : {}),
      state: serializeExternalChatBinding(await readExternalChatBinding(wsId)),
    });
  },
  { allowAppSessionAuth: true, rateLimitKind: 'mutate' }
);
