import {
  DriveMoveError,
  MAX_DRIVE_MOVE_ENTRIES,
  moveWorkspaceDriveEntries,
} from '@tuturuuu/storage-core/workspace-drive-move';
import { WorkspaceStorageError } from '@tuturuuu/storage-core/storage-download-error';
import { z } from 'zod';
import { resolveWorkspaceStorageRouteAuth } from '@/legacy-api-routes/v1/workspaces/[wsId]/storage/route-auth';

const MAX_BODY_BYTES = 16 * 1024;
const directorySchema = z.strictObject({
  workspaceId: z.string().min(1).max(100),
  path: z.string().max(960),
});
const moveSchema = z.strictObject({
  source: directorySchema,
  destination: directorySchema,
  entries: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(255),
        isFolder: z.boolean(),
      })
    )
    .min(1)
    .max(MAX_DRIVE_MOVE_ENTRIES),
});

async function readMoveBody(request: Request): Promise<unknown> {
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
    'application/json'
  ) {
    throw new WorkspaceStorageError('Expected a JSON request', 415);
  }
  if (!request.body)
    throw new WorkspaceStorageError('Missing request body', 400);

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new WorkspaceStorageError('Move request timed out', 408)),
      10_000
    );
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        throw new WorkspaceStorageError('Move request is too large', 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (error) {
    if (error instanceof WorkspaceStorageError) throw error;
    throw new WorkspaceStorageError('Invalid JSON request', 400);
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const auth = await resolveWorkspaceStorageRouteAuth(request, wsId);
    if (!auth.ok) return auth.response;
    const { normalizedWsId, permissions } = auth.context;
    if (permissions.withoutPermission('manage_drive')) {
      return Response.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const parsed = moveSchema.safeParse(await readMoveBody(request));
    if (!parsed.success) {
      return Response.json(
        { message: 'Invalid move request' },
        { status: 400 }
      );
    }
    const { source, destination, entries } = parsed.data;
    const matchesWorkspace = (id: string) =>
      id === wsId || id === normalizedWsId;
    if (
      !matchesWorkspace(source.workspaceId) ||
      !matchesWorkspace(destination.workspaceId)
    ) {
      return Response.json(
        { message: 'Both folders must belong to the current workspace' },
        { status: 403 }
      );
    }

    const data = await moveWorkspaceDriveEntries(
      normalizedWsId,
      { sourcePath: source.path, destinationPath: destination.path, entries },
      request.signal
    );
    return Response.json({ data });
  } catch (error) {
    if (error instanceof DriveMoveError) {
      return Response.json(
        { message: error.message, code: error.code },
        { status: error.status }
      );
    }
    if (error instanceof WorkspaceStorageError) {
      return Response.json(
        { message: error.message },
        { status: error.status }
      );
    }
    console.error(
      'Unexpected Drive move failure',
      error instanceof Error ? error.name : typeof error
    );
    return Response.json(
      { message: 'Could not move entries' },
      { status: 500 }
    );
  }
}
