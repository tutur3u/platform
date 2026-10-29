import { MAX_AI_CHAT_UPLOAD_BYTES } from '@tuturuuu/ai/chat/attachment-content-guard';
import {
  isMiraImagePath,
  resolveMiraImageReadAccess,
} from '@tuturuuu/storage-core/mira-image-access';
import type { StorageAccessOutcome } from '@tuturuuu/storage-core/storage-access-audit';
import {
  classifyWorkspaceStoragePath,
  resolveWorkspaceStorageAccess,
} from '@tuturuuu/storage-core/workspace-storage-access';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { auditStorageAccess } from '@/lib/storage/storage-access-audit';
import {
  createMiraImageAccessContext,
  createWorkspaceStorageAccessContext,
  WorkspaceStorageAccessLookupError,
} from '@/lib/storage/workspace-storage-access-context';
import { verifyAiChatStoredObjects } from '../_lib/chat-resource-object-guard';
import { AI_CHAT_FILE_APP_SESSION_TARGETS } from '../_lib/session-targets';

const SignedReadUrlRequestSchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(10),
});

/** Signed read URL validity: 1 hour */
const SIGNED_URL_EXPIRY_SECONDS = 3600;
const AUDIT_ROUTE = '/api/ai/chat/signed-read-url';

/**
 * POST /api/ai/chat/signed-read-url
 *
 * Generates signed read URLs for one or more storage paths.
 * Used after uploading files to get persistent URLs that survive
 * blob URL revocation and page refreshes.
 *
 * Request body: { paths: string[] }
 * Response: { urls: Array<{ path: string; signedUrl: string | null }> }
 *
 * Only AI chat attachment paths (`{wsId}/chats/ai/resources/...`) and Mira
 * generated images (`{wsId}/mira/images/{file}`) are accepted; Drive files
 * go through Drive APIs, which add egress controls. Chat paths must pass the
 * same rules as the `workspaces` bucket RLS
 * (`@tuturuuu/storage-core/workspace-storage-access`): the caller must be a
 * workspace MEMBER and own the chat (or the temp folder). Mira images stay
 * service-only in RLS and are signed on read only for the member who
 * generated them (`@tuturuuu/storage-core/mira-image-access`). One denied
 * path rejects the whole request. Authorized chat attachments are then
 * signed only if their stored size and leading bytes match their extension
 * (`chat-resource-object-guard`); Mira images are server-written.
 */
export const POST = withSessionAuth(
  async (req, { supabase, user }) => {
    try {
      const body = await req.json();
      const { paths } = SignedReadUrlRequestSchema.parse(body);
      // One audit row per requested object (no file names; see storage-core).
      const audit = (outcomes: StorageAccessOutcome[]) =>
        auditStorageAccess(
          paths.map((path, index) => ({
            action: 'sign' as const,
            actorId: user.id,
            outcome: outcomes[index] ?? 'error',
            path,
            route: AUDIT_ROUTE,
            wsId: path.split('/')[0],
          }))
        );
      if (
        paths.some(
          (path) => !isAiChatResourcePath(path) && !isMiraImagePath(path)
        )
      ) {
        audit(paths.map(() => 'invalid'));
        return NextResponse.json(
          { message: 'Invalid storage path' },
          { status: 400 }
        );
      }

      const storageAdmin = await createDynamicAdminClient();
      const context = createWorkspaceStorageAccessContext({
        sbAdmin: storageAdmin,
        supabase,
        userId: user.id,
      });
      const miraContext = createMiraImageAccessContext({
        sbAdmin: storageAdmin,
        storageContext: context,
      });
      const decisions = await Promise.all(
        paths.map((path) =>
          isMiraImagePath(path)
            ? resolveMiraImageReadAccess(path, miraContext)
            : resolveWorkspaceStorageAccess(path, 'select', context)
        )
      );

      const decided = (rejected: StorageAccessOutcome) =>
        decisions.map((decision) =>
          decision === 'invalid'
            ? 'invalid'
            : decision === 'forbidden'
              ? 'denied'
              : rejected
        );

      if (decisions.includes('invalid')) {
        audit(decided('invalid'));
        return NextResponse.json(
          { message: 'Invalid storage path' },
          { status: 400 }
        );
      }

      if (decisions.includes('forbidden')) {
        audit(decided('denied'));
        return NextResponse.json(
          { message: "You don't have access to this file" },
          { status: 403 }
        );
      }

      const verdicts = await verifyAiChatStoredObjects({
        admin: storageAdmin,
        objects: paths
          .filter((path) => !isMiraImagePath(path))
          .map((path) => ({ path })),
      });
      const verdictList = [...verdicts.values()];
      if (verdictList.includes('rejected')) {
        return NextResponse.json(
          {
            code: 'invalid_upload',
            maxSizeBytes: MAX_AI_CHAT_UPLOAD_BYTES,
            message: 'Uploaded file failed size or content verification',
          },
          { status: 422 }
        );
      }
      if (verdictList.includes('unavailable')) {
        return NextResponse.json(
          { message: 'File not found' },
          { status: 404 }
        );
      }

      const { data: signedUrls, error } = await storageAdmin.storage
        .from('workspaces')
        .createSignedUrls(paths, SIGNED_URL_EXPIRY_SECONDS);

      if (error) {
        console.error('Error creating signed read URLs', {
          error,
          pathCount: paths.length,
        });
        audit(paths.map(() => 'error'));
        return NextResponse.json(
          { message: 'Failed to generate read URLs' },
          { status: 500 }
        );
      }

      audit(paths.map(() => 'allowed'));
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

      if (err instanceof WorkspaceStorageAccessLookupError) {
        console.error('Error verifying chat file access', err);
        return NextResponse.json(
          { message: 'Failed to verify file access' },
          { status: 500 }
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

/** AI chat attachment paths only: `{wsId}/chats/ai/resources/...`. */
function isAiChatResourcePath(path: string) {
  const target = classifyWorkspaceStoragePath(path);
  return (
    (target?.kind === 'ai-chat' || target?.kind === 'ai-chat-temp') &&
    path.split('/')[1] === 'chats'
  );
}
