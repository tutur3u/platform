'use client';

import { getPostEmailColumns } from './columns';
import PostsFilters from './filters';
import { PostDisplay } from './post-display';
import type { PostEmail } from './types';
import { createPostEmailKey, usePosts } from './use-posts';
import { CustomDataTable } from '@/components/custom-data-table';
import useEmail from '@/hooks/useEmail';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { MailWarning, Send } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

interface SearchParams {
  page?: string;
  pageSize?: string;
  includedGroups?: string | string[];
  excludedGroups?: string | string[];
  userId?: string;
}

export default function PostsClient({
  wsId,
  locale,
  postsData: initialPostsData,
  postsCount: initialPostsCount,
  postsStatus: initialPostsStatus,
  searchParams,
}: {
  wsId: string;
  locale: string;
  postsData: PostEmail[];
  postsCount: number;
  postsStatus: { count: number | null };
  searchParams: SearchParams;
}) {
  const t = useTranslations();
  const [posts, setPosts] = usePosts();
  const { success } = useEmail();
  const [selectedPost, setSelectedPost] = useState<PostEmail | null>(null);

  // SWR fetchers
  const fetchPosts = async () => {
    const res = await fetch(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      `/api/v1/workspaces/${wsId}/posts?${new URLSearchParams(searchParams as any)}`
    );
    if (!res.ok) throw new Error('Failed to fetch posts');
    return res.json();
  };
  const fetchStatus = async () => {
    const res = await fetch(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      `/api/v1/workspaces/${wsId}/posts/status?${new URLSearchParams(searchParams as any)}`
    );
    if (!res.ok) throw new Error('Failed to fetch status');
    return res.json();
  };

  const { data: postsData, mutate: mutatePosts } = useSWR(
    ['posts', wsId, searchParams],
    fetchPosts,
    { fallbackData: { data: initialPostsData, count: initialPostsCount } }
  );
  const { data: postsStatus, mutate: mutateStatus } = useSWR(
    ['postsStatus', wsId, searchParams],
    fetchStatus,
    { fallbackData: initialPostsStatus }
  );

  // Auto-refresh after email sent
  useEffect(() => {
    if (success) {
      mutatePosts();
      mutateStatus();
    }
  }, [success, mutatePosts, mutateStatus]);

  // Update selected post when postsData changes
  useEffect(() => {
    if (posts.selected && postsData?.data) {
      const found = postsData.data.find(
        (p: PostEmail) => createPostEmailKey(p) === posts.selected
      );
      setSelectedPost(found || null);
    } else {
      setSelectedPost(null);
    }
  }, [posts.selected, postsData]);

  return (
    <div className="space-y-6 p-6">
      <FeatureSummary
        pluralTitle={t('ws-post-emails.plural')}
        singularTitle={t('ws-post-emails.singular')}
        description={t('ws-post-emails.description')}
      />

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="flex w-full flex-col items-center gap-1 rounded border border-dynamic-purple/15 bg-dynamic-purple/15 p-4 text-dynamic-purple">
          <div className="flex items-center gap-2 text-xl font-bold">
            <Send />
            {t('ws-post-emails.sent_emails')}
          </div>
          <Separator className="my-1 bg-dynamic-purple/15" />
          <div className="text-xl font-semibold md:text-3xl">
            {postsStatus?.count || 0}
            <span className="opacity-50">/{postsData?.count || 0}</span>
          </div>
        </div>
        <div className="flex w-full flex-col items-center gap-1 rounded border border-dynamic-red/15 bg-dynamic-red/15 p-4 text-dynamic-red">
          <div className="flex items-center gap-2 text-xl font-bold">
            <MailWarning />
            {t('ws-post-emails.pending_emails')}
          </div>
          <Separator className="my-1 bg-dynamic-red/15" />
          <div className="text-3xl font-semibold">
            {(postsData?.count || 0) - (postsStatus?.count || 0)}
            <span className="opacity-50">/{postsData?.count || 0}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <CustomDataTable
            data={postsData?.data || []}
            namespace="post-email-data-table"
            columnGenerator={getPostEmailColumns}
            extraData={{ locale }}
            count={postsData?.count || 0}
            filters={<PostsFilters wsId={wsId} searchParams={searchParams} />}
            defaultVisibility={{
              id: false,
              email: false,
              subject: false,
              is_completed: false,
              notes: false,
              created_at: false,
              post_title: false,
              post_content: false,
            }}
            disableSearch
            onRowClick={(row) => {
              setPosts({
                ...posts,
                selected: createPostEmailKey(row),
              });
            }}
          />
        </div>
        <div className="min-h-[500px]">
          <PostDisplay postEmail={selectedPost} />
        </div>
      </div>
    </div>
  );
}
