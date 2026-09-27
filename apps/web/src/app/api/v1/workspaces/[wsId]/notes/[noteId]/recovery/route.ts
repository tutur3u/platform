import {
  decryptWorkspaceKey,
  encryptWorkspaceKey,
  getMasterKey,
} from '@tuturuuu/utils/encryption';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { hasRecentPasskeyClaim } from './passkey-claim';

const secretSchema = z.string().regex(/^[A-Za-z0-9+/]{43}=$/);
type Params = { params: Promise<{ wsId: string; noteId: string }> };

async function authorize(request: NextRequest, wsId: string, noteId: string) {
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
        { status: membership.error === 'membership_lookup_failed' ? 500 : 403 }
      ),
    };
  }
  const { data: note, error } = await auth.supabase
    .from('notes')
    .select('content')
    .eq('id', noteId)
    .eq('ws_id', wsId)
    .eq('creator_id', auth.user.id)
    .eq('deleted', false)
    .maybeSingle();
  if (error) {
    return {
      response: NextResponse.json(
        { error: 'Note lookup failed' },
        { status: 500 }
      ),
    };
  }
  if (!note) {
    return {
      response: NextResponse.json({ error: 'Note not found' }, { status: 404 }),
    };
  }
  return { auth, note };
}

export async function POST(request: NextRequest, { params }: Params) {
  await connection();
  const { wsId, noteId } = await params;
  const authorized = await authorize(request, wsId, noteId);
  if ('response' in authorized) return authorized.response;
  const parsed = z
    .object({ secret: secretSchema })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 });
  }
  try {
    const secret = Buffer.from(parsed.data.secret, 'base64');
    if (secret.length !== 32) throw new Error('Invalid key length');
    const payload = Buffer.from(
      JSON.stringify({
        wsId,
        noteId,
        userId: authorized.auth.user.id,
        secret: parsed.data.secret,
      })
    );
    const wrapped = await encryptWorkspaceKey(payload, getMasterKey());
    return NextResponse.json(
      { wrapped },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      { error: 'Recovery is unavailable' },
      { status: 503 }
    );
  }
}

export async function GET(request: NextRequest, { params }: Params) {
  await connection();
  const { wsId, noteId } = await params;
  const authorized = await authorize(request, wsId, noteId);
  if ('response' in authorized) return authorized.response;
  // Only a verified Supabase JWT with a recent passkey AMR can recover.
  // App-session clients have no Supabase claims and fail closed here.
  const { data: claimData, error: claimError } =
    await authorized.auth.supabase.auth.getClaims();
  const claims = claimData?.claims;
  const recentPasskey =
    !claimError && hasRecentPasskeyClaim(claims, authorized.auth.user.id);
  if (!recentPasskey) {
    return NextResponse.json(
      { error: 'Recent passkey authentication required' },
      { status: 403 }
    );
  }
  const content = authorized.note.content;
  const attrs =
    content && typeof content === 'object' && !Array.isArray(content)
      ? (content as { attrs?: Record<string, unknown> }).attrs
      : undefined;
  const envelope = attrs?.tuturuuuLock;
  if (
    !envelope ||
    typeof envelope !== 'object' ||
    (envelope as { mode?: unknown }).mode !== 'device'
  ) {
    return NextResponse.json(
      { error: 'Recovery key unavailable' },
      { status: 404 }
    );
  }
  const wrapped = (envelope as { recovery?: unknown }).recovery;
  if (typeof wrapped !== 'string' || wrapped.length > 2048) {
    return NextResponse.json(
      { error: 'Recovery key unavailable' },
      { status: 404 }
    );
  }
  try {
    const payload = JSON.parse(
      (await decryptWorkspaceKey(wrapped, getMasterKey())).toString('utf8')
    ) as { wsId?: string; noteId?: string; userId?: string; secret?: string };
    if (
      payload.wsId !== wsId ||
      payload.noteId !== noteId ||
      payload.userId !== authorized.auth.user.id ||
      !secretSchema.safeParse(payload.secret).success
    ) {
      throw new Error('Recovery key binding mismatch');
    }
    return NextResponse.json(
      { secret: payload.secret },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch {
    return NextResponse.json(
      { error: 'Recovery key unavailable' },
      { status: 404 }
    );
  }
}
