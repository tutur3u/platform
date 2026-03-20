import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MAX_URL_LENGTH } from '@tuturuuu/utils/constants';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enqueueApprovedPostEmails } from '@/lib/post-email-queue';

interface Params {
  params: Promise<{
    groupId: string;
    wsId: string;
  }>;
}

// Validate payload
const SingleSchema = z.object({
  post_id: z.guid(),
  user_id: z.guid(),
  is_completed: z.boolean(),
  notes: z.string().max(MAX_URL_LENGTH).nullable().optional(),
});
const MultipleSchema = z.array(SingleSchema);

export async function GET(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const { searchParams } = new URL(req.url);
  const postId = searchParams.get('postId');

  if (!postId) {
    return NextResponse.json(
      { message: 'Post ID is required' },
      { status: 400 }
    );
  }

  // Resolve workspace ID
  const wsId = await normalizeWorkspaceId(id);

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;
  if (withoutPermission('view_user_groups_posts')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to view user group posts' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .from('user_group_post_checks')
    .select(
      'post_id, user_id, is_completed, notes, created_at, email_id, approval_status, approved_at, rejected_at, rejection_reason'
    )
    .eq('post_id', postId);

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error fetching group checks' },
      { status: 500 }
    );
  }

  return NextResponse.json(data || []);
}

export async function POST(req: Request, { params }: Params) {
  const sbAdmin = await createAdminClient();
  const data = await req.json();
  const { wsId: id, groupId } = await params;

  // Resolve workspace ID
  const wsId = await normalizeWorkspaceId(id);

  // Check permissions
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  const { withoutPermission } = permissions;
  if (withoutPermission('update_user_groups_posts')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to update user group posts' },
      { status: 403 }
    );
  }

  const isArray = Array.isArray(data);
  const parse = isArray
    ? MultipleSchema.safeParse(data)
    : SingleSchema.safeParse(data);

  if (!parse.success) {
    return NextResponse.json({ message: 'Invalid payload' }, { status: 400 });
  }

  const postIds = isArray
    ? [
        ...new Set(
          (parse.data as z.infer<typeof MultipleSchema>).map(
            (item) => item.post_id
          )
        ),
      ]
    : [(parse.data as z.infer<typeof SingleSchema>).post_id];

  if (postIds.length !== 1) {
    return NextResponse.json(
      { message: 'All checks must belong to the same post' },
      { status: 400 }
    );
  }

  const postId = postIds[0];
  if (!postId) {
    return NextResponse.json(
      { message: 'All checks must belong to the same post' },
      { status: 400 }
    );
  }

  // Ensure resource belongs to this workspace and group
  const { data: post, error: postErr } = await sbAdmin
    .from('user_group_posts')
    .select(`
      id,
      group_id,
      workspace_user_groups!inner(ws_id)
    `)
    .eq('id', postId)
    .eq('workspace_user_groups.ws_id', wsId)
    .eq('group_id', groupId)
    .maybeSingle();

  if (postErr || !post) {
    return NextResponse.json({ message: 'Post not found' }, { status: 404 });
  }

  const insertPayload = isArray
    ? (parse.data as z.infer<typeof MultipleSchema>).map((item) => ({
        ...item,
        post_id: postId, // Ensure it uses the validated postId
      }))
    : [
        {
          ...(parse.data as z.infer<typeof SingleSchema>),
          post_id: postId, // Ensure it uses the validated postId
        },
      ];

  const { error } = await sbAdmin
    .from('user_group_post_checks')
    .insert(insertPayload);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error inserting data into user_group_post_checks' },
      { status: 500 }
    );
  }

  await enqueueApprovedPostEmails(sbAdmin, {
    wsId,
    postId,
    groupId,
    userIds: insertPayload.map((item) => item.user_id),
  });

  return NextResponse.json({ message: 'Data inserted successfully' });
}
