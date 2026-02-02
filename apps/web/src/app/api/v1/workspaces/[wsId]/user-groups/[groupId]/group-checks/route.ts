import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{
    groupId: string;
    wsId: string;
  }>;
}

// Validate payload
const SingleSchema = z.object({
  post_id: z.uuid(),
  user_id: z.uuid(),
  is_completed: z.boolean(),
  notes: z.string().max(2000).nullable().optional(),
});
const MultipleSchema = z.array(SingleSchema);

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const data = await req.json();
  const { wsId, groupId } = await params;

  // Check permissions
  const { withoutPermission } = await getPermissions({ wsId });
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

  // Ensure resource belongs to this workspace and group, and is approved
  const { data: post, error: postErr } = await supabase
    .from('user_group_posts')
    .select(`
      id,
      group_id,
      post_approval_status,
      workspace_user_groups!inner(ws_id)
    `)
    .eq('id', postId)
    .eq('workspace_user_groups.ws_id', wsId)
    .eq('group_id', groupId)
    .maybeSingle();

  if (postErr || !post) {
    return NextResponse.json({ message: 'Post not found' }, { status: 404 });
  }

  if (post.post_approval_status !== 'APPROVED') {
    return NextResponse.json(
      { message: 'Post must be approved before updating checks' },
      { status: 403 }
    );
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

  const { error } = await supabase
    .from('user_group_post_checks')
    .insert(insertPayload);

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error inserting data into user_group_post_checks' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'Data inserted successfully' });
}
