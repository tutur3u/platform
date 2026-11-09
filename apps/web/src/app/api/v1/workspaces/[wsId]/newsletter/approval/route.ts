import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import {
  enforceRootWorkspaceAdmin,
  getWorkspace,
  WorkspaceAccessError,
  WorkspaceAuthError,
  WorkspaceRedirectRequiredError,
} from '@tuturuuu/utils/workspace-helper';
import { connection } from 'next/server';
import { z } from 'zod';
import {
  newsletterErrorResponse,
  newsletterJson,
  readJson,
} from '@/lib/newsletter/http';
import { setNewsletterApproval } from '@/lib/newsletter/service';

const bodySchema = z
  .object({
    action: z.enum(['approve', 'suspend', 'remove']),
    localPart: z.string().max(32).optional(),
  })
  .strict();

async function requirePlatformAdmin() {
  try {
    // Root workspace MEMBER admission. There is no narrower newsletter permission.
    await enforceRootWorkspaceAdmin(ROOT_WORKSPACE_ID);
    return null;
  } catch (error) {
    if (error instanceof WorkspaceAuthError) {
      return newsletterJson({ error: 'Unauthorized' }, 401);
    }
    if (
      error instanceof WorkspaceAccessError ||
      error instanceof WorkspaceRedirectRequiredError
    ) {
      return newsletterJson({ error: 'Forbidden' }, 403);
    }
    throw error;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const denied = await requirePlatformAdmin();
  if (denied) return denied;
  const { wsId } = await params;
  const workspace = await getWorkspace(wsId, { useAdmin: true });
  if (!workspace?.id) return newsletterJson({ error: 'not_found' }, 404);
  const user = await getCurrentUser();
  if (!user || typeof user.id !== 'string') {
    return newsletterJson({ error: 'Unauthorized' }, 401);
  }
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return newsletterJson({ error: 'invalid_request' }, 400);
  try {
    const result = await setNewsletterApproval({
      action: parsed.data.action,
      actorId: user.id,
      localPart: parsed.data.localPart ?? null,
      wsId: workspace.id,
    });
    return newsletterJson(result);
  } catch (error) {
    return newsletterErrorResponse(error);
  }
}
