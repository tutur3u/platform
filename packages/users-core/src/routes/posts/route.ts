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
      data: postsData.data,
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
