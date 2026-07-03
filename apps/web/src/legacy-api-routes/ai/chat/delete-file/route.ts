import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';
import { AI_CHAT_FILE_APP_SESSION_TARGETS } from '../_lib/session-targets';

const DeleteFileRequestSchema = z.object({
  wsId: z.string().min(1),
  path: z.string().min(1).max(1024),
});

/**
 * POST /api/ai/chat/delete-file
 *
 * Deletes a previously uploaded chat file from Supabase Storage.
 * Path must remain within `{wsId}/chats/ai/resources/`.
 */
export const POST = withSessionAuth(
  async (req, { user, supabase }) => {
    try {
      const body = await req.json();
      const { wsId: wsIdRaw, path } = DeleteFileRequestSchema.parse(body);
      const wsId = await normalizeWorkspaceId(wsIdRaw, supabase, req);

      if (!wsId) {
        return NextResponse.json(
          { message: 'Invalid workspace ID' },
          { status: 400 }
        );
      }

      const expectedPrefix = `${wsId}/chats/ai/resources/`;
      if (!path.startsWith(expectedPrefix) || path.includes('..')) {
        return NextResponse.json(
          { message: 'Invalid storage path' },
          { status: 400 }
        );
      }

      const membership = await verifyWorkspaceMembershipType({
        wsId: wsId,
        userId: user.id,
        supabase: supabase,
      });

      if (membership.error === 'membership_lookup_failed') {
        serverLogger.error(
          'Error validating workspace membership for delete-file',
          { error: membership.error, wsId }
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
      const { error } = await sbAdmin.storage.from('workspaces').remove([path]);

      if (error) {
        serverLogger.error('Error deleting chat file from storage', {
          error,
          path,
        });
        return NextResponse.json(
          { message: 'Failed to delete file' },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json(
          { message: 'Invalid request data', errors: err.issues },
          { status: 400 }
        );
      }

      serverLogger.error('Unexpected error in chat delete-file', err);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  {
    allowAiTempAuth: true,
    allowAppSessionAuth: { targetApp: AI_CHAT_FILE_APP_SESSION_TARGETS },
    rateLimit: { windowMs: 60000, maxRequests: 120 },
  }
);
