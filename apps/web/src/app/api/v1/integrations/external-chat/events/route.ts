import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyExternalChatSecret } from '@/lib/external-chat/crypto';
import { externalChatEventSchema } from '@/lib/external-chat/schemas';
import {
  importExternalChatEvent,
  readExternalChatBinding,
} from '@/lib/external-chat/store';
import { safeParseBody } from '@/lib/safe-parse-body';

export async function POST(request: Request) {
  const wsId = request.headers.get('x-external-binding-id');
  const authorization = request.headers.get('authorization');
  const secret = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : null;
  if (!wsId || !z.string().uuid().safeParse(wsId).success || !secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const state = await readExternalChatBinding(wsId);
  const expectedHash = state?.credentials?.ingest_secret_hash;
  if (
    !state?.binding.is_enabled ||
    !isChatEnabled(state.binding.settings) ||
    !state.credentials?.verified_at ||
    !expectedHash ||
    !verifyExternalChatSecret(secret, expectedHash)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await safeParseBody(request as never, 64 * 1024);
  if (body instanceof NextResponse) return body;
  const parsed = externalChatEventSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid event', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await importExternalChatEvent({
    connectorKey: state.binding.canonical_project_id ?? wsId,
    event: parsed.data,
    mappedUserId: getMappedUserId(state.binding.settings, parsed.data.agentId),
    wsId,
  });

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

  return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
}

function getMappedUserId(settings: unknown, agentId: string) {
  if (!settings || typeof settings !== 'object') return null;
  const chat = (settings as Record<string, unknown>).chat;
  if (!chat || typeof chat !== 'object') return null;
  const mappings = (chat as Record<string, unknown>).agentMappings;
  if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) {
    return null;
  }
  const mapped = (mappings as Record<string, unknown>)[agentId];
  return typeof mapped === 'string' &&
    z.string().uuid().safeParse(mapped).success
    ? mapped
    : null;
}

function isChatEnabled(settings: unknown) {
  if (!settings || typeof settings !== 'object') return false;
  const chat = (settings as Record<string, unknown>).chat;
  return Boolean(
    chat &&
      typeof chat === 'object' &&
      (chat as Record<string, unknown>).enabled === true
  );
}
