import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { AI_CHAT_FILE_APP_SESSION_TARGETS } from '../_lib/session-targets';

const SignedReadUrlRequestSchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(10),
});

/** Signed read URL validity: 1 hour */
const SIGNED_URL_EXPIRY_SECONDS = 3600;

/**
 * POST /api/ai/chat/signed-read-url
 *
 * Generates signed read URLs for one or more storage paths.
 * Used after uploading files to get persistent URLs that survive
 * blob URL revocation and page refreshes.
 *
 * Request body: { paths: string[] }
 * Response: { urls: Array<{ path: string; signedUrl: string | null }> }
 */
export const POST = withSessionAuth(
  async (req, { supabase, user }) => {
    try {
      const body = await req.json();
      const { paths } = SignedReadUrlRequestSchema.parse(body);
      const workspaceIds = new Set<string>();

      for (const path of paths) {
        const workspaceId = getAiChatStorageWorkspaceId(path);
        if (!workspaceId) {
          return NextResponse.json(
            { message: 'Invalid storage path' },
            { status: 400 }
          );
        }

        workspaceIds.add(workspaceId);
      }

      for (const wsId of workspaceIds) {
        const membership = await verifyWorkspaceMembershipType({
          wsId,
          userId: user.id,
          supabase,
        });

        if (membership.error === 'membership_lookup_failed') {
          console.error(
            'Error validating workspace membership for signed-read-url',
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
      }

      const storageAdmin = await createDynamicAdminClient();

      const { data: signedUrls, error } = await storageAdmin.storage
        .from('workspaces')
        .createSignedUrls(paths, SIGNED_URL_EXPIRY_SECONDS);

      if (error) {
        console.error('Error creating signed read URLs', {
          error,
          pathCount: paths.length,
        });
        return NextResponse.json(
          { message: 'Failed to generate read URLs' },
          { status: 500 }
        );
      }

      const urls = paths.map((path, index) => ({
        path,
        signedUrl: signedUrls?.[index]?.signedUrl ?? null,
      }));

      return NextResponse.json({ urls });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json(
          { message: 'Invalid request data', errors: err.issues },
          { status: 400 }
        );
      }

      console.error('Unexpected error in signed-read-url', err);
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

function getAiChatStorageWorkspaceId(path: string) {
  if (path.includes('..')) return null;

  const [wsId, chatsSegment, aiSegment, resourcesSegment] = path.split('/');
  if (
    !wsId ||
    chatsSegment !== 'chats' ||
    aiSegment !== 'ai' ||
    resourcesSegment !== 'resources'
  ) {
    return null;
  }

  return wsId;
}
