import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';

const inputSchema = z.object({
  mailboxId: z.uuid(),
  threadId: z.uuid(),
});

/** Archive only the current user's Mail notifications after opening a thread. */
export async function POST(request: Request) {
  const requestOrigin = request.headers.get('origin');
  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }
  const auth = await resolveSessionAuthContext(request);
  if (!auth.ok) return auth.response;
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: 'Invalid mail thread' }, { status: 400 });
  }
  try {
    const admin = await createAdminClient({ noCookie: true });
    const { data, error } = await admin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', auth.user.id)
      .eq('type', 'mail_received')
      .eq('entity_type', 'mail_message')
      .eq('scope', 'user')
      .is('ws_id', null)
      .is('read_at', null)
      .contains('data', {
        mailboxId: input.data.mailboxId,
        threadId: input.data.threadId,
        userId: auth.user.id,
      })
      .select('id');
    if (error) {
      console.error('Failed to archive viewed Mail notifications', {
        kind: error.code,
      });
      return NextResponse.json({ error: 'Archive failed' }, { status: 500 });
    }
    return NextResponse.json(
      { archived: data?.length ?? 0 },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('Mail notification archive unavailable', {
      kind: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json({ error: 'Archive unavailable' }, { status: 503 });
  }
}
