import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { resolveChatRouteContext } from '@/lib/chat/private-rpc';
import {
  createIngestSecret,
  decryptControlSecret,
  encryptControlSecret,
  hashExternalChatSecret,
  secretLastFour,
  verifyExternalChatSecret,
} from '@/lib/external-chat/crypto';
import {
  configureExternalChatBridge,
  updateExternalChatBridgeCredential,
  verifyExternalChatControl,
} from '@/lib/external-chat/delivery';
import {
  clearExternalChatCredential,
  issueExternalChatPairingTicket,
  markExternalChatCredentialVerified,
  promoteExternalChatCredential,
  readExternalChatBinding,
  serializeExternalChatBinding,
  stageExternalChatCredential,
} from '@/lib/external-chat/store';
import { safeParseBody } from '@/lib/safe-parse-body';

type Params = { wsId: string };
const mutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('rotate_ingest') }),
  z.object({
    action: z.literal('set_control'),
    secret: z.string().min(24).max(512),
  }),
  z.object({ action: z.literal('clear_ingest') }),
  z.object({ action: z.literal('clear_control') }),
  z.object({
    action: z.literal('pair'),
    ingestSecret: z.string().min(24).max(512),
  }),
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
    const body = await safeParseBody(request, 4096);
    if (body instanceof NextResponse) return body;
    const parsed = mutationSchema.safeParse(body.data);
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Invalid credential action' },
        { status: 400 }
      );

    const wsId = context.context.normalizedWsId;
    let current = await readExternalChatBinding(wsId);
    if (!current) {
      return NextResponse.json({ error: 'Binding not found' }, { status: 404 });
    }
    if (
      parsed.data.action === 'clear_ingest' ||
      parsed.data.action === 'clear_control'
    ) {
      await clearExternalChatCredential(
        wsId,
        parsed.data.action === 'clear_ingest' ? 'ingest' : 'control'
      );
      return NextResponse.json({
        state: serializeExternalChatBinding(
          await readExternalChatBinding(wsId)
        ),
      });
    }
    try {
      current = await reconcilePendingCredential(wsId, current);
    } catch {
      return NextResponse.json(
        {
          error: 'External chat bridge credential reconciliation failed',
          state: serializeExternalChatBinding(current),
        },
        { status: 502 }
      );
    }
    let issuedSecret: string | undefined;
    if (parsed.data.action === 'rotate_ingest') {
      issuedSecret = createIngestSecret();
      const encrypted = await encryptControlSecret(wsId, issuedSecret);
      await stageCredential(wsId, {
        action: 'set_ingest',
        encrypted,
        hash: hashExternalChatSecret(issuedSecret),
        lastFour: secretLastFour(issuedSecret),
      });
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
      await promotePendingCredential(wsId, 'set_ingest');
    } else if (parsed.data.action === 'set_control') {
      const encrypted = await encryptControlSecret(wsId, parsed.data.secret);
      await stageCredential(wsId, {
        action: 'rotate_control',
        encrypted,
        hash: null,
        lastFour: secretLastFour(parsed.data.secret),
      });
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
      await promotePendingCredential(wsId, 'rotate_control');
    } else if (parsed.data.action === 'pair') {
      const expectedHash = current.credentials?.ingest_secret_hash;
      if (
        !expectedHash ||
        !verifyExternalChatSecret(parsed.data.ingestSecret, expectedHash)
      ) {
        return NextResponse.json(
          { error: 'Ingest credential does not match' },
          { status: 400 }
        );
      }
      const verifiedCiphertext = current.credentials?.control_secret_encrypted;
      if (!verifiedCiphertext) {
        return NextResponse.json(
          { error: 'Control credential is not configured' },
          { status: 400 }
        );
      }
      const pairingTicket = createIngestSecret();
      await issueExternalChatPairingTicket(
        wsId,
        hashExternalChatSecret(pairingTicket),
        new Date(Date.now() + 5 * 60_000).toISOString()
      );
      try {
        await configureExternalChatBridge({
          ingestSecret: parsed.data.ingestSecret,
          pairingTicket,
          wsId,
        });
        await verifyExternalChatControl(wsId);
      } catch {
        return NextResponse.json(
          {
            error: 'External chat bridge pairing failed',
            state: serializeExternalChatBinding(
              await readExternalChatBinding(wsId)
            ),
          },
          { status: 502 }
        );
      }
      if (
        !(await markExternalChatCredentialVerified(wsId, verifiedCiphertext))
      ) {
        return NextResponse.json(
          { error: 'Credential changed during pairing' },
          { status: 409 }
        );
      }
    } else {
      const verifiedCiphertext = current.credentials?.control_secret_encrypted;
      if (!verifiedCiphertext) {
        return NextResponse.json(
          { error: 'Control credential is not configured' },
          { status: 400 }
        );
      }
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
      if (
        !(await markExternalChatCredentialVerified(wsId, verifiedCiphertext))
      ) {
        return NextResponse.json(
          { error: 'Credential changed during verification' },
          { status: 409 }
        );
      }
    }

    return NextResponse.json({
      ...(issuedSecret ? { secret: issuedSecret } : {}),
      state: serializeExternalChatBinding(await readExternalChatBinding(wsId)),
    });
  },
  { allowAppSessionAuth: { targetApp: 'cms' }, rateLimitKind: 'mutate' }
);

type BindingState = NonNullable<
  Awaited<ReturnType<typeof readExternalChatBinding>>
>;

async function stageCredential(
  wsId: string,
  pending: {
    action: 'rotate_control' | 'set_ingest';
    encrypted: string;
    hash: string | null;
    lastFour: string;
  }
) {
  await stageExternalChatCredential(wsId, pending);
}

async function promotePendingCredential(
  wsId: string,
  action: 'rotate_control' | 'set_ingest'
) {
  const state = await readExternalChatBinding(wsId);
  const credentials = state?.credentials;
  if (
    credentials?.pending_action !== action ||
    !credentials.pending_secret_encrypted
  ) {
    throw new Error('Pending credential is unavailable');
  }
  await promoteExternalChatCredential(
    wsId,
    action,
    credentials.pending_secret_encrypted
  );
}

async function reconcilePendingCredential(wsId: string, state: BindingState) {
  const credentials = state.credentials;
  if (!credentials?.pending_action || !credentials.pending_secret_encrypted) {
    return state;
  }
  const pendingSecret = await decryptControlSecret(
    wsId,
    credentials.pending_secret_encrypted
  );
  if (credentials.control_secret_encrypted) {
    try {
      await updateExternalChatBridgeCredential({
        action: credentials.pending_action,
        secret: pendingSecret,
        wsId,
      });
    } catch (error) {
      if (credentials.pending_action !== 'rotate_control') throw error;
      await updateExternalChatBridgeCredential({
        action: credentials.pending_action,
        secret: pendingSecret,
        signingCiphertext: credentials.pending_secret_encrypted,
        wsId,
      });
    }
  }
  await promotePendingCredential(wsId, credentials.pending_action);
  const refreshed = await readExternalChatBinding(wsId);
  if (!refreshed) throw new Error('Binding disappeared during reconciliation');
  return refreshed;
}
