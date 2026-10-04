import { joinMeetingDocument } from '@tuturuuu/meet-core/features/call/server/documents';
import { roomRoute } from '@tuturuuu/meet-core/features/call/server/room-service';
import { connection } from 'next/server';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  await connection();
  return roomRoute(request, (await params).meetingId, joinMeetingDocument);
}
