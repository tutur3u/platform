import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import PostsClient from './client';
import { getPostsPageData } from './data';
import type { PostsSearchParams } from './types';

export const metadata: Metadata = {
  title: 'Posts',
  description: 'Manage Posts in your Tuturuuu workspace.',
};

export default async function PostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ wsId: string; locale: string }>;
  searchParams: Promise<PostsSearchParams>;
}) {
  const { locale } = await params;
  const searchParamsData = await searchParams;

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const permissions = await getPermissions({ wsId });

        const canApprovePosts =
          permissions?.containsPermission('send_user_group_post_emails') ??
          false;

        const { postsData, postsStatus } = await getPostsPageData(
          wsId,
          searchParamsData
        );

        return (
          <PostsClient
            wsId={wsId}
            locale={locale}
            canApprovePosts={canApprovePosts}
            searchParams={searchParamsData}
            postsData={postsData}
            postsStatus={postsStatus}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}
