import { collaborationTicketSchema } from '@tuturuuu/realtime/collaboration';
import { verifyRealtimePayload } from '@tuturuuu/realtime/core/token';
import { saveProgrammingRoomCheckpoint } from '@tuturuuu/storage-core/programming-collaboration';
import { PlaygroundDelta } from '@tuturuuu/utils/playground-schema';
import { NextResponse } from 'next/server';
export async function POST(request: Request) {
  const secret = process.env.MEET_REALTIME_TOKEN_SECRET;
  if (!secret)
    return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
  const token = collaborationTicketSchema.safeParse(
    verifyRealtimePayload(
      request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1] ?? '',
      secret
    )
  );
  if (
    !token.success ||
    token.data.exp * 1000 <= Date.now() ||
    !['checkpoint', 'runner-files'].includes(token.data.kind) ||
    (token.data.kind === 'runner-files' && !token.data.runId) ||
    !!token.data.runId !== !!token.data.runnerId ||
    token.data.role !== 'owner' ||
    token.data.resource !== 'playground' ||
    token.data.ownerId !== token.data.userId ||
    token.data.roomId !==
      (token.data.meetingId
        ? `meeting:${token.data.meetingId}:playground:${token.data.resourceId}`
        : `playground:${token.data.resourceId}`)
  )
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 3 * 1024 * 1024)
      return NextResponse.json({ error: 'Too large' }, { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = PlaygroundDelta.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Invalid checkpoint' },
        { status: 400 }
      );
    return NextResponse.json(
      await saveProgrammingRoomCheckpoint(
        token.data.ownerId,
        token.data.resourceId,
        parsed.data,
        token.data.meetingId,
        token.data.runId,
        token.data.runnerId,
        token.data.kind === 'runner-files'
      )
    );
  } catch {
    return NextResponse.json({ error: 'Checkpoint failed' }, { status: 409 });
  }
}
