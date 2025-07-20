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

interface SearchParams {
  page?: string;
  pageSize?: string;
  includedGroups?: string | string[];
  excludedGroups?: string | string[];
  userId?: string;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

interface PostsClientProps {
  wsId: string;
  locale: string;
  searchParams: SearchParams;
  postsData: { data: PostEmail[]; count: number };
  postsStatus: { count: number };
}

export default function PostsClient({
  wsId,
  locale,
  searchParams,
  postsData,
  postsStatus,
}: PostsClientProps) {
  const t = useTranslations();
  const [posts, setPosts] = usePosts();
  const { globalState, setGlobalState } = useEmail();
  const [selectedPost, setSelectedPost] = useState<PostEmail | null>(null);

  // Remove React Query and client-side fetches for initial data
  // Keep invalidate logic for client-side updates if needed

  useEffect(() => {
    if (globalState.success) {
      // Invalidate logic for client-side updates (if you have mutation logic)
      setGlobalState((prev) => ({ ...prev, success: false }));
    }
  }, [globalState.success, setGlobalState]);

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
        <div className="h-screen overflow-y-auto">
          <CustomDataTable
            data={postsData?.data || []}
            namespace="post-email-data-table"
            columnGenerator={getPostEmailColumns}
            extraData={{
              locale,
              onEmailSent: () => {
                // Optionally, trigger a client-side refresh if you have mutation logic
              },
            }}
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
        <div className="h-full overflow-y-auto">
          <PostDisplay postEmail={selectedPost} />
        </div>
      </div>
    </div>
  );
}
