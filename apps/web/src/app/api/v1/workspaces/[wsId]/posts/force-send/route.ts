import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  hasPostEmailBeenSent,
  sendPostEmailImmediately,
} from '@/lib/post-email-queue';
import { isValidEmailAddress } from '@/lib/post-email-queue/utils';

const ForceSendPostEmailSchema = z.object({
  postId: z.string().min(1),
  userId: z.string().min(1),
});

type ApprovalStatus = Database['public']['Enums']['approval_status'];
type ForceSendCheckRow = {
  post_id: string;
  user_id: string;
  is_completed: boolean | null;
  user: {
    id: string;
    email: string | null;
    ws_id: string;
  } | null;
  user_group_posts: {
    group_id: string;
  };
};

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { wsId: id } = await params;
    const wsId = await normalizeWorkspaceId(id);

    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();

    const [body, rootPermissions, authResult] = await Promise.all([
      request.json(),
      getPermissions({ wsId: ROOT_WORKSPACE_ID, request }),
      resolveAuthenticatedSessionUser(supabase),
    ]);

    const parsed = ForceSendPostEmailSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request body', issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const canForceSend =
      rootPermissions?.containsPermission('manage_workspace_roles') ?? false;
    if (!canForceSend) {
      return NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const user = authResult.user;
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { postId, userId } = parsed.data;

    const [{ data: check, error: checkError }, alreadySent] = await Promise.all(
      [
        sbAdmin
          .from('user_group_post_checks')
          .select(
            'post_id, user_id, is_completed, user:workspace_users!user_id(id, email, ws_id), user_group_posts!inner(group_id, workspace_user_groups!inner(ws_id))'
          )
          .eq('post_id', postId)
          .eq('user_id', userId)
          .eq('user_group_posts.workspace_user_groups.ws_id', wsId)
          .maybeSingle<ForceSendCheckRow>(),
        hasPostEmailBeenSent(sbAdmin, postId, userId),
      ]
    );

    if (checkError) throw checkError;
    if (!check) {
      return NextResponse.json(
        { message: 'Post recipient check not found' },
        { status: 404 }
      );
    }

    if (check.is_completed === null) {
      return NextResponse.json(
        {
          message:
            'This recipient does not have a completion check recorded yet',
        },
        { status: 409 }
      );
    }

    if (!isValidEmailAddress(check.user?.email)) {
      return NextResponse.json(
        {
          message:
            'This recipient does not have a deliverable email address on record',
        },
        { status: 409 }
      );
    }

    if (alreadySent) {
      return NextResponse.json(
        { message: 'This post email has already been sent' },
        { status: 409 }
      );
    }

    const { data: queueRow, error: queueLookupError } = await sbAdmin
      .from('post_email_queue')
      .select('status')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    if (queueLookupError) throw queueLookupError;

    if (queueRow?.status === 'queued') {
      return NextResponse.json(
        { message: 'This post email is already queued' },
        { status: 409 }
      );
    }

    if (queueRow?.status === 'processing') {
      return NextResponse.json(
        { message: 'This post email is already being processed' },
        { status: 409 }
      );
    }

    const { data: workspaceUserLink, error: workspaceUserLinkError } =
      await sbAdmin
        .from('workspace_user_linked_users')
        .select('virtual_user_id')
        .eq('platform_user_id', user.id)
        .eq('ws_id', wsId)
        .maybeSingle();

    if (workspaceUserLinkError) throw workspaceUserLinkError;

    const now = new Date().toISOString();
    const approvalPatch: Database['public']['Tables']['user_group_post_checks']['Update'] =
      {
        approval_status: 'APPROVED' as ApprovalStatus,
        approved_at: now,
        approved_by: workspaceUserLink?.virtual_user_id ?? null,
        rejected_at: null,
        rejected_by: null,
        rejection_reason: null,
      };

    const { error: approvalError } = await sbAdmin
      .from('user_group_post_checks')
      .update(approvalPatch)
      .eq('post_id', postId)
      .eq('user_id', userId);

    if (approvalError) throw approvalError;

    const result = await sendPostEmailImmediately(sbAdmin, {
      wsId,
      groupId: check.user_group_posts.group_id,
      postId,
      userId,
      senderPlatformUserId: user.id,
    });

    if (result.status !== 'sent') {
      const { data: finalQueueRow, error: finalQueueRowError } = await sbAdmin
        .from('post_email_queue')
        .select('status, last_error, blocked_reason')
        .eq('id', result.id)
        .maybeSingle();

      if (finalQueueRowError) throw finalQueueRowError;

      return NextResponse.json(
        {
          message:
            finalQueueRow?.last_error ??
            finalQueueRow?.blocked_reason ??
            'Immediate send failed',
          status: finalQueueRow?.status ?? result.status,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true, status: result.status });
  } catch (error) {
    console.error('Error in POST /api/v1/workspaces/[wsId]/posts/force-send:', {
      error,
    });
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
