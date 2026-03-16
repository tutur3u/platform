import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import type { PostEmail } from '@/app/[locale]/(dashboard)/[wsId]/posts/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;

  // Check permissions
  const permissions = await getPermissions({ wsId });
  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;

  const page = searchParams.get('page') || '1';
  const pageSize = searchParams.get('pageSize') || '10';
  const includedGroups = searchParams.getAll('includedGroups');
  const excludedGroups = searchParams.getAll('excludedGroups');
  const userId = searchParams.get('userId') || undefined;

  const sbAdmin = await createAdminClient();

  const hasFilters =
    includedGroups.length > 0 || excludedGroups.length > 0 || !!userId;

  const queryBuilder = sbAdmin
    .from('user_group_post_checks')
    .select(
      `notes, user_id, email_id, is_completed, user:workspace_users!inner(email, display_name, full_name, ws_id), ...user_group_posts${hasFilters ? '!inner' : ''}(post_id:id, post_title:title, post_content:content, ...workspace_user_groups(group_id:id, group_name:name)), ...sent_emails(subject)`,
      {
        count: 'exact',
      }
    )
    .eq('workspace_users.ws_id', wsId)
    .not('workspace_users.email', 'ilike', '%@easy%');

  if (includedGroups.length > 0) {
    queryBuilder.in('user_group_posts.group_id', includedGroups);
  }
  if (excludedGroups.length > 0) {
    queryBuilder.not('user_group_posts.group_id', 'in', excludedGroups);
  }
  if (userId) {
    queryBuilder.eq('user_id', userId);
  }
  if (page && pageSize) {
    const parsedPage = Number.parseInt(page, 10);
    const parsedSize = Number.parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = start + parsedSize - 1;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder.order('created_at', {
    ascending: false,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: (data || []).map((item: any) => ({
      notes: item.notes,
      user_id: item.user_id,
      email_id: item.email_id,
      is_completed: item.is_completed,
      ws_id: item.user?.ws_id,
      email: item.user?.email,
      recipient: item.user?.full_name || item.user?.display_name,
      post_id: item.post_id,
      post_title: item.post_title,
      post_content: item.post_content,
      group_id: item.group_id,
      group_name: item.group_name,
      subject: item.subject,
    })),
    count: count || 0,
  } as { data: PostEmail[]; count: number });
}
