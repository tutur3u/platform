import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import PostsClient from './client';
import { getPostsPageData } from './data';
import {
  buildCanonicalPostsSearchParams,
  postsSearchParamsCache,
} from './search-params.server';
import type { RawPostsSearchParams } from './types';

export const metadata: Metadata = {
  title: 'Posts',
  description: 'Manage Posts in your Tuturuuu workspace.',
};

export default async function PostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ wsId: string; locale: string }>;
  searchParams: Promise<RawPostsSearchParams>;
}) {
  const { locale, wsId } = await params;
  const searchParamsData = await searchParams;
  const parsedSearchParams = await postsSearchParamsCache.parse(
    searchParamsData as Record<string, string | string[] | undefined>
  );
  const canonicalSearchParams = buildCanonicalPostsSearchParams(
    searchParamsData,
    parsedSearchParams
  );

  if (canonicalSearchParams) {
    redirect(`/${wsId}/posts?${canonicalSearchParams}`);
  }

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const [permissions, rootPermissions] = await Promise.all([
          getPermissions({ wsId }),
          getPermissions({ wsId: ROOT_WORKSPACE_ID }),
        ]);

        const canApprovePosts =
          permissions?.containsPermission('send_user_group_post_emails') ??
          false;
        const canForceSendPosts =
          rootPermissions?.containsPermission('manage_workspace_roles') ??
          false;

        const { postsData, postsStatus } = await getPostsPageData(
          wsId,
          parsedSearchParams
        );

        return (
          <PostsClient
            wsId={wsId}
            locale={locale}
            canApprovePosts={canApprovePosts}
            canForceSendPosts={canForceSendPosts}
            searchParams={parsedSearchParams}
            postsData={postsData}
            postsStatus={postsStatus}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}
