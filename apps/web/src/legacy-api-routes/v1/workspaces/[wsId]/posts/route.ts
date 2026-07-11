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

  const query = loadPostsSearchParams(req.nextUrl.searchParams);

  try {
    const { postsData, postsStatus } = await getPostsPageData(wsId, query);

    return NextResponse.json({
      data: postsData.data,
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
