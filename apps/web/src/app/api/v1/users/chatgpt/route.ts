import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { revokeRegistration } from '@/lib/chatgpt/oauth';
import { getChatGPTAccess, listChatGPTModels } from '@/lib/chatgpt/provider';
import { chatGPTEnabled, withChatGPTStore } from '@/lib/chatgpt/storage';

export const GET = withSessionAuth(async (_request, { user }) => {
  await connection();
  if (!chatGPTEnabled())
    return NextResponse.json(
      { enabled: false, accounts: [] },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  try {
    const accounts = await withChatGPTStore(user.id, async (store) =>
      store.registrations.map((entry) => ({
        clientId: entry.clientId,
        label: `${entry.email ?? 'ChatGPT'} · ${entry.clientId.slice(-8)}`,
        connected:
          !!entry.refreshToken &&
          entry.scopes.includes('chatgpt.tokens.use.direct'),
      }))
    );
    const catalog = [];
    for (const account of accounts) {
      let models: Awaited<ReturnType<typeof listChatGPTModels>> = [];
      let available = account.connected;
      if (available) {
        try {
          models = await listChatGPTModels(
            await getChatGPTAccess(user.id, account.clientId)
          );
        } catch {
          available = false;
        }
      }
      catalog.push({ ...account, available, models });
    }
    return NextResponse.json(
      { enabled: true, userId: user.id, accounts: catalog },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      { error: 'Unable to read protected ChatGPT connections' },
      { status: 503 }
    );
  }
});

export const DELETE = withSessionAuth(async (request, { user }) => {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    return NextResponse.json(
      { error: 'Invalid request origin' },
      { status: 403 }
    );
  if (!chatGPTEnabled())
    return NextResponse.json({ error: 'Unavailable' }, { status: 404 });
  const parsed = z
    .object({ clientId: z.string().startsWith('oaiapp_') })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid connection' }, { status: 400 });
  try {
    const remoteRevoked = await withChatGPTStore(user.id, async (store) => {
      const registration = store.registrations.find(
        (entry) => entry.clientId === parsed.data.clientId
      );
      if (!registration) return true;
      const confirmed = await revokeRegistration(registration);
      delete registration.accessToken;
      delete registration.refreshToken;
      delete registration.idToken;
      delete registration.expiresAt;
      registration.scopes = [];
      return confirmed;
    });
    return NextResponse.json({ remoteRevoked });
  } catch {
    return NextResponse.json(
      { error: 'Unable to disconnect ChatGPT' },
      { status: 503 }
    );
  }
});
