import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

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
 */
export const POST = withSessionAuth(
  async (req, { user, supabase }) => {
    try {
      const body = await req.json();
      const { wsId: wsIdRaw, chatId } = FileUrlsRequestSchema.parse(body);
      const wsId = await normalizeWorkspaceId(wsIdRaw);

      if (!wsId) {
        return NextResponse.json(
          { message: 'Invalid workspace ID' },
          { status: 400 }
        );
      }

      const membership = await verifyWorkspaceMembershipType({
        wsId: wsId,
        userId: user.id,
        supabase: supabase,
      });

      if (membership.error === 'membership_lookup_failed') {
        console.error(
          'Error validating workspace membership for file-urls:',
          membership.error
        );
        return NextResponse.json(
          { message: 'Failed to verify workspace access' },
          { status: 500 }
        );
      }

      if (!membership.ok) {
        return NextResponse.json(
          { message: "You don't have access to this workspace" },
          { status: 403 }
        );
      }

      const sbAdmin = await createDynamicAdminClient();

      // List all files in the chat's storage folder
      const storagePath = `${wsId}/chats/ai/resources/${chatId}`;
      const { data: fileList, error: listError } = await sbAdmin.storage
        .from('workspaces')
        .list(storagePath, {
          limit: 50,
          sortBy: { column: 'created_at', order: 'asc' },
        });

      if (listError) {
        console.error('Error listing chat files:', listError);
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
        console.error('Error creating signed read URLs:', signError);
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

      console.error('Unexpected error in chat file-urls:', err);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAiTempAuth: true, rateLimitKind: 'read' }
);

/** Strip the leading `{timestamp}_` prefix from a storage filename. */
function stripTimestampPrefix(name: string): string {
  // Pattern: digits followed by underscore at the start
  const match = name.match(/^\d+_(.+)$/);
  return match?.[1] ?? name;
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
