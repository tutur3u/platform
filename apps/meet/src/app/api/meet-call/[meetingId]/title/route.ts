import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';
import {
  getMeetCallAccess,
  MeetCallAccessError,
} from '@/features/call/lib/call-access';

const titleSchema = z.object({ name: z.string().trim().min(1).max(255) });
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Invalid origin' }, { status: 403, headers });
  try {
    const { meetingId } = await params;
    const { user, isHost } = await getMeetCallAccess(meetingId, '');
    if (!isHost)
      return Response.json(
        { error: 'Permission denied' },
        { status: 403, headers }
      );
    const reader = request.body?.getReader();
    if (!reader)
      return Response.json(
        { error: 'Invalid title' },
        { status: 400, headers }
      );
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return Response.json(
          { error: 'Payload too large' },
          { status: 413, headers }
        );
      }
      chunks.push(new Uint8Array(value));
    }
    let payload: unknown;
    try {
      payload = JSON.parse(await new Blob(chunks).text());
    } catch {
      return Response.json(
        { error: 'Invalid title' },
        { status: 400, headers }
      );
    }
    const parsed = titleSchema.safeParse(payload);
    if (!parsed.success)
      return Response.json(
        { error: 'Invalid title' },
        { status: 400, headers }
      );
    const db = await createAdminClient({ noCookie: true });
    const { data, error } = await db
      .from('workspace_meetings')
      .update({ name: parsed.data.name })
      .eq('id', meetingId)
      .eq('creator_id', user.id)
      .select('name')
      .maybeSingle();
    if (error) throw new Error('title_update_failed');
    if (!data)
      return Response.json(
        { error: 'Meeting not found' },
        { status: 404, headers }
      );
    return Response.json({ name: data.name }, { headers });
  } catch (error) {
    return Response.json(
      { error: 'Title update failed' },
      {
        status: error instanceof MeetCallAccessError ? error.status : 500,
        headers,
      }
    );
  }
}
