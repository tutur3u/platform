import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { getPostsPageData } from '@/app/[locale]/(dashboard)/[wsId]/posts/data';
import { loadPostsSearchParams } from '@/app/[locale]/(dashboard)/[wsId]/posts/search-params.server';
import type {
  PostEmail,
  PostEmailStatusSummary,
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
