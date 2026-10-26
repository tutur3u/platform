import { resolveWorkspaceStorageFolderAccess } from '@tuturuuu/storage-core/workspace-storage-access';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  createWorkspaceStorageAccessContext,
  WorkspaceStorageAccessLookupError,
} from '@/lib/storage/workspace-storage-access-context';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';
import { AI_CHAT_FILE_APP_SESSION_TARGETS } from '../_lib/session-targets';

const FileUrlsRequestSchema = z.object({
  wsId: z.string().min(1),
  chatId: z.guid(),
});

/** Signed read URL validity: 1 hour */
const SIGNED_URL_EXPIRY_SECONDS = 3600;

/**
 * POST /api/ai/chat/file-urls
 *
 * Lists files in a chat's storage folder and returns signed read URLs for each.
 * This allows the client to display file previews for previously uploaded files
 * (e.g. when loading an existing chat from history).
 *
 * Storage path: `{wsId}/chats/ai/resources/{chatId}/`
 *
 * Authorization mirrors the `workspaces` bucket RLS
 * (`@tuturuuu/storage-core/workspace-storage-access`): only a workspace
 * MEMBER who created the chat may list it. Public chat pages do not use this
 * route; they render shared messages without attachment URLs.
 */
export const POST = withSessionAuth(
  async (req, { user, supabase }) => {
    try {
      const body = await req.json();
      const { wsId: wsIdRaw, chatId } = FileUrlsRequestSchema.parse(body);
      const wsId = await normalizeWorkspaceId(wsIdRaw, supabase, req);

      if (!wsId) {
        return NextResponse.json(
          { message: 'Invalid workspace ID' },
          { status: 400 }
        );
      }

      const sbAdmin = await createDynamicAdminClient();
      const storagePath = `${wsId}/chats/ai/resources/${chatId}`;
      const access = await resolveWorkspaceStorageFolderAccess(
        storagePath,
        'select',
        createWorkspaceStorageAccessContext({
          sbAdmin,
          supabase,
          userId: user.id,
        })
      );

      if (access === 'invalid') {
        return NextResponse.json(
          { message: 'Invalid storage path' },
          { status: 400 }
        );
      }

      if (access === 'forbidden') {
        return NextResponse.json(
          { message: "You don't have access to this chat" },
          { status: 403 }
        );
      }

      // List all files in the chat's storage folder
      const { data: fileList, error: listError } = await sbAdmin.storage
        .from('workspaces')
        .list(storagePath, {
          limit: 50,
          sortBy: { column: 'created_at', order: 'asc' },
        });

      if (listError) {
        console.error('Error listing chat files', {
          error: listError,
          storagePath,
        });
        return NextResponse.json(
          { message: 'Failed to list files' },
          { status: 500 }
        );
      }

      if (!fileList || fileList.length === 0) {
        return NextResponse.json({ files: [] });
      }

      // Filter out directory placeholders (items with no metadata / id is null)
      const realFiles = fileList.filter(
        (f) => f.id != null && f.name !== '.emptyFolderPlaceholder'
      );

      if (realFiles.length === 0) {
        return NextResponse.json({ files: [] });
      }

      // Generate signed URLs for all files
      const filePaths = realFiles.map((f) => `${storagePath}/${f.name}`);

      const { data: signedUrls, error: signError } = await sbAdmin.storage
        .from('workspaces')
        .createSignedUrls(filePaths, SIGNED_URL_EXPIRY_SECONDS);

      if (signError) {
        console.error('Error creating signed read URLs', {
          error: signError,
          fileCount: filePaths.length,
        });
        return NextResponse.json(
          { message: 'Failed to generate file URLs' },
          { status: 500 }
        );
      }

      // Map file metadata with signed URLs
      const files = realFiles.map((file, index) => {
        const signedData = signedUrls?.[index];
        const fullPath = `${storagePath}/${file.name}`;

        // Derive MIME type from extension
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        const mimeType = extensionToMime(ext);

        // Strip the timestamp prefix from the display name
        // Storage names are formatted: `{timestamp}_{sanitizedFilename}`
        const displayName = stripTimestampPrefix(file.name);

        return {
          path: fullPath,
          name: displayName,
          size: file.metadata?.size ?? 0,
          type: mimeType,
          signedUrl: signedData?.signedUrl ?? null,
          createdAt: file.created_at ?? null,
        };
      });

      return NextResponse.json({ files });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json(
          { message: 'Invalid request data', errors: err.issues },
          { status: 400 }
        );
      }

      if (err instanceof WorkspaceStorageAccessLookupError) {
        console.error('Error verifying chat file access', err);
        return NextResponse.json(
          { message: 'Failed to verify chat access' },
          { status: 500 }
        );
      }

      console.error('Unexpected error in chat file-urls', err);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  {
    allowAiTempAuth: true,
    allowAppSessionAuth: { targetApp: AI_CHAT_FILE_APP_SESSION_TARGETS },
    rateLimitKind: 'read',
  }
);

// Signed-URL remediation re-keys objects to `{uuidv4}-{original name}`.
const REKEY_PREFIX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-/i;

/** Strip the re-key and leading `{timestamp}_` prefixes from a storage filename. */
function stripTimestampPrefix(name: string): string {
  const original = name.replace(REKEY_PREFIX, '');
  // Pattern: digits followed by underscore at the start
  const match = original.match(/^\d+_(.+)$/);
  return match?.[1] ?? original;
}

/** Map common file extensions to MIME types. */
function extensionToMime(ext: string): string {
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    pdf: 'application/pdf',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    txt: 'text/plain',
    csv: 'text/csv',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    json: 'application/json',
    md: 'text/markdown',
  };
  return map[ext] ?? 'application/octet-stream';
}
