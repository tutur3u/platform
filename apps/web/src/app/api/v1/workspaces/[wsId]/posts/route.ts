import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { getPostsPageData } from '@/app/[locale]/(dashboard)/[wsId]/posts/data';
import type {
  PostEmail,
  PostEmailStatusSummary,
  PostsSearchParams,
} from '@/app/[locale]/(dashboard)/[wsId]/posts/types';

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

  const query: PostsSearchParams = {
    page: searchParams.get('page') || '1',
    pageSize: searchParams.get('pageSize') || '10',
    includedGroups: searchParams.getAll('includedGroups'),
    excludedGroups: searchParams.getAll('excludedGroups'),
    userId: searchParams.get('userId') || undefined,
    queueStatus: searchParams.get('queueStatus') || undefined,
  };

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
