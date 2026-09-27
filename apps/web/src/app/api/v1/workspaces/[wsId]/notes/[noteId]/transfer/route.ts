import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';

type Params = { params: Promise<{ wsId: string; noteId: string }> };
const idSchema = z.string().uuid();
const postSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), id: idSchema }),
  z.object({
    action: z.literal('approve'),
    id: idSchema,
    sealed: z
      .string()
      .regex(/^[A-Za-z0-9+/]+={0,2}$/)
      .max(256),
  }),
]);

async function getNote(request: NextRequest, wsId: string, noteId: string) {
  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: true,
  });
  if (!auth.ok) return { response: auth.response };
  const membership = await verifyWorkspaceMembershipType({
    wsId,
    userId: auth.user.id,
    supabase: auth.supabase,
  });
  if (!membership.ok) {
    return {
      response: NextResponse.json(
        { error: 'Forbidden' },
        {
          status: membership.error === 'membership_lookup_failed' ? 500 : 403,
        }
      ),
    };
  }
  const { data: note, error } = await auth.supabase
    .from('notes')
    .select('content,updated_at')
    .eq('id', noteId)
    .eq('ws_id', wsId)
    .eq('creator_id', auth.user.id)
    .eq('deleted', false)
    .maybeSingle();
  if (error)
    return {
      response: NextResponse.json({ error: 'Lookup failed' }, { status: 500 }),
    };
  if (!note)
    return {
      response: NextResponse.json({ error: 'Not found' }, { status: 404 }),
    };
  const content = note.content as Record<string, unknown> | null;
  const attrs = content?.attrs as Record<string, unknown> | undefined;
  const lock = attrs?.tuturuuuLock as Record<string, unknown> | undefined;
  if (lock?.version !== 1 || lock.mode !== 'device') {
    return {
      response: NextResponse.json(
        { error: 'Not a device-locked note' },
        { status: 409 }
      ),
    };
  }
  return {
    auth,
    content: content!,
    attrs: attrs!,
    lock,
    updatedAt: note.updated_at,
  };
}

export async function POST(request: NextRequest, { params }: Params) {
  await connection();
  const { wsId, noteId } = await params;
  const found = await getNote(request, wsId, noteId);
  if ('response' in found) return found.response;
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid transfer' }, { status: 400 });
  const now = Date.now();
  const prior = found.lock.transfer as
    | { id?: string; expiresAt?: number; sealed?: string }
    | undefined;
  const transfer =
    parsed.data.action === 'start'
      ? { id: parsed.data.id, expiresAt: now + 120000 }
      : prior?.id === parsed.data.id &&
          typeof prior.expiresAt === 'number' &&
          prior.expiresAt > now &&
          !prior.sealed
        ? { ...prior, sealed: parsed.data.sealed }
        : null;
  if (!transfer)
    return NextResponse.json({ error: 'Transfer expired' }, { status: 409 });
  const content = {
    ...found.content,
    attrs: { ...found.attrs, tuturuuuLock: { ...found.lock, transfer } },
  };
  let update = found.auth.supabase
    .from('notes')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', noteId)
    .eq('ws_id', wsId)
    .eq('creator_id', found.auth.user.id);
  update =
    found.updatedAt === null
      ? update.is('updated_at', null)
      : update.eq('updated_at', found.updatedAt);
  const { data, error } = await update.select('id').maybeSingle();
  if (error)
    return NextResponse.json({ error: 'Transfer failed' }, { status: 500 });
  if (!data)
    return NextResponse.json(
      { error: 'Note changed; try again' },
      { status: 409 }
    );
  return NextResponse.json(
    { success: true },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function GET(request: NextRequest, { params }: Params) {
  await connection();
  const { wsId, noteId } = await params;
  const found = await getNote(request, wsId, noteId);
  if ('response' in found) return found.response;
  const id = new URL(request.url).searchParams.get('id');
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid transfer' }, { status: 400 });
  }
  const transfer = found.lock.transfer as
    | { id?: string; expiresAt?: number; sealed?: string }
    | undefined;
  if (
    transfer?.id !== id ||
    !transfer.expiresAt ||
    transfer.expiresAt < Date.now()
  ) {
    return NextResponse.json({ error: 'Transfer expired' }, { status: 404 });
  }
  return NextResponse.json(
    { sealed: transfer.sealed ?? null },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
