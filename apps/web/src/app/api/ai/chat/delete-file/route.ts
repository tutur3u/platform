import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

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
      const wsId = await normalizeWorkspaceId(wsIdRaw);

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

      const { data: membership, error: membershipError } = await supabase
        .from('workspace_members')
        .select('user_id')
        .eq('ws_id', wsId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (membershipError) {
        console.error(
          'Error validating workspace membership for delete-file:',
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

      const sbAdmin = await createDynamicAdminClient();
      const { error } = await sbAdmin.storage.from('workspaces').remove([path]);

      if (error) {
        console.error('Error deleting chat file from storage:', error);
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

      console.error('Unexpected error in chat delete-file:', err);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { rateLimit: { windowMs: 60000, maxRequests: 120 } }
);
