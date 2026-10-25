import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';
import { verifyAiChatOwner } from '../_lib/chat-resource-access';
import { AI_CHAT_FILE_APP_SESSION_TARGETS } from '../_lib/session-targets';

const AUDIO_EXTENSIONS = new Set([
  'aac',
  'flac',
  'm4a',
  'mp3',
  'ogg',
  'opus',
  'wav',
]);

const ALLOWED_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'heic',
  'heif',
  'pdf',
  ...AUDIO_EXTENSIONS,
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
// Every model request injects the chat's attachments within a 32 MiB budget,
// so a larger single file could upload yet never reach the model.
const MAX_AI_CHAT_UPLOAD_BYTES = 32 * 1024 * 1024;

const UploadUrlRequestSchema = z.object({
  filename: z.string().min(1).max(MAX_FILENAME_LENGTH),
  wsId: z.string().min(1),
  chatId: z.guid().optional(),
  sizeBytes: z.number().int().min(0).optional(),
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
        sizeBytes,
      } = UploadUrlRequestSchema.parse(body);
      const wsId = await normalizeWorkspaceId(wsIdRaw, supabase, req);

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
        console.error('Error validating workspace membership for upload-url', {
          error: membership.error,
          wsId,
        });
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

      // Validate file extension
      const dotIndex = filename.lastIndexOf('.');
      const fileExt =
        dotIndex !== -1 ? filename.slice(dotIndex + 1).toLowerCase() : '';

      if (!fileExt || !ALLOWED_EXTENSIONS.has(fileExt)) {
        return NextResponse.json(
          { code: 'unsupported_file_type', message: 'Unsupported file type' },
          { status: 400 }
        );
      }

      if (sizeBytes !== undefined && sizeBytes > MAX_AI_CHAT_UPLOAD_BYTES) {
        return NextResponse.json(
          {
            code: 'file_too_large',
            maxSizeBytes: MAX_AI_CHAT_UPLOAD_BYTES,
            message: 'File is too large',
          },
          { status: 413 }
        );
      }

      if (chatId) {
        const access = await verifyAiChatOwner({
          chatId,

          userId: user.id,
        });
        if (access === 'lookup_failed') {
          return NextResponse.json(
            { message: 'Failed to verify chat access' },
            { status: 500 }
          );
        }
        if (access !== 'allowed') {
          return NextResponse.json(
            { message: 'Chat not found' },
            { status: 404 }
          );
        }
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

      // Membership checks stay request-scoped; storage signed-upload creation uses admin.
      const storageAdmin = await createDynamicAdminClient();

      // Generate signed upload URL (valid for 120 seconds)
      const { data, error } = await storageAdmin.storage
        .from('workspaces')
        .createSignedUploadUrl(storagePath, { upsert: true });

      if (error || !data) {
        console.error('Error creating signed upload URL', {
          error,
          storagePath,
        });
        return NextResponse.json(
          { message: 'Failed to generate upload URL' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        signedUrl: data.signedUrl,
        token: data.token,
        path: storagePath,
        maxSizeBytes: MAX_AI_CHAT_UPLOAD_BYTES,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json(
          { message: 'Invalid request data', errors: err.issues },
          { status: 400 }
        );
      }

      console.error('Unexpected error in chat upload-url', err);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  // Rate limit: 60 signed URLs per minute per IP (2x previous)
  {
    allowAiTempAuth: true,
    allowAppSessionAuth: { targetApp: AI_CHAT_FILE_APP_SESSION_TARGETS },
    rateLimit: { windowMs: 60000, maxRequests: 60 },
  }
);
