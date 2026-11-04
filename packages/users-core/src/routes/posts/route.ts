import { NextResponse } from 'next/server';
import type { PostEmail, PostEmailStatusSummary } from '../../lib/post-types';
import { getWorkspacePostsPageData } from '../../lib/posts/data';
import { parseWorkspacePostsSearchParams } from '../../lib/posts/search-params';
import { getUserGroupRoutePermissions } from '../../lib/user-groups/route-auth';
import { resolveUserGroupRouteWorkspaceId } from '../../lib/user-groups/route-helpers';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId: rawWsId } = await params;
  const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
  const permissions = await getUserGroupRoutePermissions(wsId, request);

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  if (
    !permissions.containsPermission('view_user_groups_posts') &&
    !permissions.containsPermission('approve_posts')
  ) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  try {
    const query = parseWorkspacePostsSearchParams(
      new URL(request.url).searchParams
    );
    const { postsData, postsStatus } = await getWorkspacePostsPageData(
      wsId,
      query
    );

    return NextResponse.json({
      count: postsData.count,
      data: permissions.containsPermission('view_users_private_info')
        ? postsData.data
        : postsData.data.map((post) => ({
            ...post,
            email: null,
            recipient: null,
            user_phone: null,
            queue_last_error: null,
          })),
      summary: postsStatus,
    } satisfies {
      count: number;
      data: PostEmail[];
      summary: PostEmailStatusSummary;
    });
  } catch (error) {
    console.error('Error loading workspace Posts', { error, wsId });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
