import {
  createWorkspaceStorageSignedReadUrl,
  createWorkspaceStorageUploadPayload,
  deleteWorkspaceStorageObjectByPath,
  getWorkspaceStorageObjectMetadataForProvider,
  resolveWorkspaceStorageProvider,
  WorkspaceStorageError,
} from '@tuturuuu/storage-core/workspace-storage-provider';
import { connection } from 'next/server';
import { z } from 'zod';
import { MeetCallAccessError } from '@/features/call/lib/call-access';
import {
  callRoomService,
  personalWorkspace,
  roomRoute,
} from '@/features/call/server/room-service';

type Params = { params: Promise<{ meetingId: string }> };
const recordingInput = z.object({
  sessionId: z.uuid(),
  contentType: z.enum(['video/webm', 'video/mp4', 'audio/webm', 'audio/mp4']),
  size: z
    .number()
    .int()
    .positive()
    .max(60 * 1024 * 1024),
});
export async function POST(request: Request, { params }: Params) {
  const { meetingId } = await params;
  return roomRoute(request, meetingId, async (access) => {
    const input = recordingInput.safeParse(
      await request.json().catch(() => null)
    );
    if (!input.success) throw new MeetCallAccessError(400, 'Invalid recording');
    const { sessionId, contentType, size } = input.data;
    const authorization = await callRoomService<{ saved: boolean }>(access, {
      action: 'recording.authorize',
      sessionId,
    });
    if (authorization.saved) return { alreadySaved: true, ok: true };
    const wsId = await personalWorkspace(access.meeting.creator_id!);
    const filename = `${sessionId}.${contentType.includes('mp4') ? 'mp4' : 'webm'}`;
    const directory = `Meet/${meetingId}/Recordings`;
    const { provider } = await resolveWorkspaceStorageProvider(wsId);
    try {
      const stored = await getWorkspaceStorageObjectMetadataForProvider(
        wsId,
        provider,
        `${directory}/${filename}`
      );
      if (
        stored.size !== size ||
        stored.contentType?.split(';')[0] !== contentType
      )
        throw new MeetCallAccessError(409, 'Recording size mismatch');
      return { alreadyUploaded: true };
    } catch (error) {
      if (!(error instanceof WorkspaceStorageError && error.status === 404))
        throw error;
    }
    return {
      upload: await createWorkspaceStorageUploadPayload(wsId, filename, {
        path: directory,
        size,
        contentType,
        upsert: false,
      }),
    };
  });
}
export async function PUT(request: Request, { params }: Params) {
  const { meetingId } = await params;
  return roomRoute(request, meetingId, async (access) => {
    const input = recordingInput.safeParse(
      await request.json().catch(() => null)
    );
    if (!input.success) throw new MeetCallAccessError(400, 'Invalid recording');
    const { sessionId, contentType, size } = input.data;
    const authorization = await callRoomService<{ saved: boolean }>(access, {
      action: 'recording.authorize',
      sessionId,
    });
    if (authorization.saved) return { ok: true };
    const wsId = await personalWorkspace(access.meeting.creator_id!);
    const path = `Meet/${meetingId}/Recordings/${sessionId}.${contentType.includes('mp4') ? 'mp4' : 'webm'}`;
    const { provider } = await resolveWorkspaceStorageProvider(wsId);
    const stored = await getWorkspaceStorageObjectMetadataForProvider(
      wsId,
      provider,
      path
    );
    if (
      stored.size !== size ||
      stored.contentType?.split(';')[0] !== contentType
    ) {
      await deleteWorkspaceStorageObjectByPath(wsId, path);
      throw new MeetCallAccessError(409, 'Recording metadata mismatch');
    }
    await callRoomService(access, {
      action: 'recording.save',
      sessionId,
      path,
      storageWsId: wsId,
    });
    return { ok: true };
  });
}
export async function GET(request: Request, { params }: Params) {
  await connection();
  const { meetingId } = await params;
  return roomRoute(request, meetingId, async (access) => {
    const sessionId = new URL(request.url).searchParams.get('sessionId');
    if (!sessionId)
      return callRoomService(access, { action: 'recording.list' });
    if (!z.uuid().safeParse(sessionId).success)
      throw new MeetCallAccessError(400, 'Invalid recording');
    const record = await callRoomService<{ path: string; storageWsId: string }>(
      access,
      { action: 'recording.read', sessionId }
    );
    const url = await createWorkspaceStorageSignedReadUrl(
      record.storageWsId,
      record.path,
      { expiresIn: 120 }
    );
    if (new URL(request.url).searchParams.get('download') === '1')
      return new Response(null, { status: 307, headers: { Location: url } });
    return {
      url: `/api/meet-call/${encodeURIComponent(meetingId)}/recording?sessionId=${encodeURIComponent(sessionId)}&download=1`,
    };
  });
}
