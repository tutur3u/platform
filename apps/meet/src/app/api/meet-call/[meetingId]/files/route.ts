import {
  createWorkspaceStorageSignedReadUrl,
  deleteWorkspaceStorageObjectByPath,
  uploadWorkspaceStorageFileDirect,
} from '@tuturuuu/storage-core/workspace-storage-provider';
import { connection } from 'next/server';
import { z } from 'zod';
import { MeetCallAccessError } from '@/features/call/lib/call-access';
import { readBoundedFormData } from '@/features/call/server/read-upload';
import {
  callRoomService,
  personalWorkspace,
  roomRoute,
} from '@/features/call/server/room-service';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
type Params = { params: Promise<{ meetingId: string }> };
export async function POST(request: Request, { params }: Params) {
  const { meetingId } = await params;
  return roomRoute(request, meetingId, async (access) => {
    await callRoomService(access, { action: 'read' });
    const form = await readBoundedFormData(request, MAX_FILE_BYTES + 65536);
    const file = form.get('file');
    if (!(file instanceof File) || !file.size || file.size > MAX_FILE_BYTES)
      throw new MeetCallAccessError(413, 'Files must be 25 MB or smaller');
    const id = crypto.randomUUID(),
      name =
        Array.from(file.name, (character) =>
          character.charCodeAt(0) < 32 ||
          character === '/' ||
          character === '\\'
            ? '_'
            : character
        )
          .join('')
          .slice(0, 180) || 'file';
    const wsId = await personalWorkspace(access.meeting.creator_id!);
    const path = `Meet/${meetingId}/Chat/${id}-${name}`;
    const contentType = file.type || 'application/octet-stream';
    await uploadWorkspaceStorageFileDirect(
      wsId,
      path,
      new Uint8Array(await file.arrayBuffer()),
      { contentType, upsert: false }
    );
    try {
      await callRoomService(access, {
        action: 'attach',
        attachment: {
          id,
          name,
          size: file.size,
          contentType,
          path,
          storageWsId: wsId,
        },
      });
    } catch (error) {
      // A lost response can follow a committed attachment. Never delete its
      // bytes unless the service definitively rejected registration.
      if (
        error instanceof MeetCallAccessError &&
        error.status >= 400 &&
        error.status < 500
      )
        await deleteWorkspaceStorageObjectByPath(wsId, path).catch(
          () => undefined
        );
      throw error;
    }
    return { id, name, size: file.size, contentType };
  });
}
export async function GET(request: Request, { params }: Params) {
  await connection();
  const { meetingId } = await params;
  return roomRoute(request, meetingId, async (access) => {
    const id = new URL(request.url).searchParams.get('id');
    if (!z.uuid().safeParse(id).success)
      throw new MeetCallAccessError(400, 'Invalid attachment');
    const file = await callRoomService<{
      path: string;
      storageWsId: string;
      name: string;
      size: number;
      contentType: string;
    }>(access, { action: 'attachment', id });
    const downloadUrl = await createWorkspaceStorageSignedReadUrl(
      file.storageWsId,
      file.path,
      { expiresIn: 120 }
    );
    if (new URL(request.url).searchParams.get('download') === '1')
      return new Response(null, {
        status: 307,
        headers: { Location: downloadUrl },
      });
    return {
      ...file,
      path: undefined,
      storageWsId: undefined,
      // Authorize again and mint a fresh signed URL when opened, including after
      // a long call. No polling or changing a playing video's source is needed.
      url: `/api/meet-call/${encodeURIComponent(meetingId)}/files?id=${encodeURIComponent(id!)}&download=1`,
    };
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const { meetingId } = await params;
  return roomRoute(request, meetingId, async (access) => {
    const input = z
      .object({ id: z.uuid() })
      .safeParse(await request.json().catch(() => null));
    if (!input.success)
      throw new MeetCallAccessError(400, 'Invalid attachment');
    const file = await callRoomService<{ path: string; storageWsId: string }>(
      access,
      { action: 'attachment.discard', id: input.data.id }
    );
    await deleteWorkspaceStorageObjectByPath(file.storageWsId, file.path);
    await callRoomService(access, {
      action: 'attachment.deleted',
      id: input.data.id,
    });
    return { ok: true };
  });
}
