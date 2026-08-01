import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { verifyExternalChatSecret } from '@/lib/external-chat/crypto';
import { externalChatEventSchema } from '@/lib/external-chat/schemas';
import {
  importExternalChatEvent,
  readExternalChatBinding,
} from '@/lib/external-chat/store';

export async function POST(request: Request) {
  const wsId = request.headers.get('x-external-binding-id');
  const authorization = request.headers.get('authorization');
  const secret = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : null;
  if (!wsId || !secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const state = await readExternalChatBinding(wsId);
  const expectedHash = state?.credentials?.ingest_secret_hash;
  if (
    !state?.binding.is_enabled ||
    !expectedHash ||
    !verifyExternalChatSecret(secret, expectedHash)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = externalChatEventSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid event', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await importExternalChatEvent({
    connectorKey: state.binding.canonical_project_id ?? wsId,
    event: parsed.data,
    wsId,
  });

  if (!result.duplicate) {
    const admin = await createAdminClient({ noCookie: true });
    const { error } = await (admin.schema('private') as any)
      .from('external_chat_sync_checkpoints')
      .upsert(
        {
          ingest_checked_at: new Date().toISOString(),
          state: 'ready',
          ws_id: wsId,
        },
        { onConflict: 'ws_id' }
      );
    if (error) console.warn('Failed to update external chat checkpoint', error);
  }

  return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
}
