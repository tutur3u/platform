import type {
  PostEmail,
  PostEmailStatusSummary,
} from '@tuturuuu/users-core/lib/post-types';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { getPostsPageData } from '@/lib/posts/data';
import { loadPostsSearchParams } from '@/lib/posts/search-params.server';

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
  if (
    !permissions.containsPermission('view_user_groups_posts') &&
    !permissions.containsPermission('approve_posts')
  ) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const query = loadPostsSearchParams(req.nextUrl.searchParams);

  try {
    const { postsData, postsStatus } = await getPostsPageData(wsId, query);

    return NextResponse.json({
      data: permissions.containsPermission('view_users_private_info')
        ? postsData.data
        : postsData.data.map((post) => ({
            ...post,
            email: null,
            recipient: null,
            user_phone: null,
            queue_last_error: null,
          })),
      count: postsData.count,
      summary: postsStatus,
    } as {
      data: PostEmail[];
      count: number;
      summary: PostEmailStatusSummary;
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
