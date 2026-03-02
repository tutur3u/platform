import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const ALLOWED_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'pdf',
  'mp4',
  'webm',
  'mov',
  'txt',
  'csv',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'doc',
  'docx',
  'json',
  'md',
]);

const MAX_FILENAME_LENGTH = 255;

const UploadUrlRequestSchema = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LENGTH),
  wsId: z.string().min(1),
  chatId: z.string().uuid().optional(),
});

/**
 * POST /api/ai/chat/upload-url
 *
 * Generates a signed upload URL for direct file upload to Supabase Storage.
 * - Authenticated users only (session auth)
 * - Files go to temp path when no chatId, or directly to the chat path
 * - The AI route automatically moves temp files on first message
 */
export const POST = withSessionAuth(
  async (req, { user, supabase }) => {
    try {
      const body = await req.json();
      const {
        filename,
        wsId: wsIdRaw,
        chatId,
      } = UploadUrlRequestSchema.parse(body);
      const wsId = await normalizeWorkspaceId(wsIdRaw);

      if (!wsId) {
        return NextResponse.json(
          { message: 'Invalid workspace ID' },
          { status: 400 }
        );
      }

      const { data: membership, error: membershipError } = await supabase
        .from('workspace_members')
        .select('user_id')
        .eq('ws_id', wsId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (membershipError) {
        console.error(
          'Error validating workspace membership for upload-url:',
          membershipError
        );
        return NextResponse.json(
          { message: 'Failed to verify workspace access' },
          { status: 500 }
        );
      }

      if (!membership) {
        return NextResponse.json(
          { message: "You don't have access to this workspace" },
          { status: 403 }
        );
      }

      // Validate file extension
      const dotIndex = filename.lastIndexOf('.');
      const fileExt =
        dotIndex !== -1 ? filename.slice(dotIndex + 1).toLowerCase() : '';

      if (!fileExt || !ALLOWED_EXTENSIONS.has(fileExt)) {
        return NextResponse.json(
          { message: 'Unsupported file type' },
          { status: 400 }
        );
      }

      // Sanitize filename: keep alphanumeric, dots, hyphens, underscores
      const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      if (!sanitized || sanitized === '_') {
        return NextResponse.json(
          { message: 'Invalid filename' },
          { status: 400 }
        );
      }

      // Construct storage path:
      //   With chatId  → {wsId}/chats/ai/resources/{chatId}/{timestamp}_{filename}
      //   Without       → {wsId}/chats/ai/resources/temp/{userId}/{timestamp}_{filename}
      const timestampedName = `${Date.now()}_${sanitized}`;
      const storagePath = chatId
        ? `${wsId}/chats/ai/resources/${chatId}/${timestampedName}`
        : `${wsId}/chats/ai/resources/temp/${user.id}/${timestampedName}`;

      // Generate signed upload URL (valid for 120 seconds)
      const { data, error } = await supabase.storage
        .from('workspaces')
        .createSignedUploadUrl(storagePath, { upsert: true });

      if (error || !data) {
        console.error('Error creating signed upload URL:', error);
        return NextResponse.json(
          { message: 'Failed to generate upload URL' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        signedUrl: data.signedUrl,
        token: data.token,
        path: storagePath,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json(
          { message: 'Invalid request data', errors: err.issues },
          { status: 400 }
        );
      }

      console.error('Unexpected error in chat upload-url:', err);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  // Rate limit: 60 signed URLs per minute per IP (2x previous)
  { rateLimit: { windowMs: 60000, maxRequests: 60 } }
);
