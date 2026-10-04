import { previewMeetingPlayground } from '@tuturuuu/meet-core/features/call/server/programming';
import { roomRoute } from '@tuturuuu/meet-core/features/call/server/room-service';
import { playgroundCapabilityResponse } from '@tuturuuu/storage-core/playground-preview';
import { connection } from 'next/server';
export async function GET(
  request: Request,
  {
    params,
  }: { params: Promise<{ meetingId: string; port: string; path?: string[] }> }
) {
  await connection();
  const { meetingId, port, path = [] } = await params;
  const capability = await playgroundCapabilityResponse({
    request,
    roomId: meetingId,
    port: Number(port),
    path,
    prefix: `/api/meet-call/${encodeURIComponent(meetingId)}/programming/preview/${port}/`,
  });
  if (capability) return capability;
  return roomRoute(request, meetingId, (access) =>
    previewMeetingPlayground(
      access,
      Number(port),
      `/${path.map(encodeURIComponent).join('/')}${new URL(request.url).search}`,
      `/api/meet-call/${encodeURIComponent(meetingId)}/programming/preview/${port}/`
    )
  );
}
