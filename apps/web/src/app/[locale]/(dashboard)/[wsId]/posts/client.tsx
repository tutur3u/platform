'use client';

import {
  Clock3,
  LoaderCircle,
  MailCheck,
  TriangleAlert,
} from '@tuturuuu/icons';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { CustomDataTable } from '@/components/custom-data-table';
import { getPostEmailColumns } from './columns';
import PostsFilters from './filters';
import { PostDisplay } from './post-display';
import type { PostEmail } from './types';
import { createPostEmailKey, usePosts } from './use-posts';

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
  postsStatus: {
    queued: number;
    processing: number;
    sent: number;
    failed: number;
    blocked: number;
    cancelled: number;
  };
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
  const [selectedPost, setSelectedPost] = useState<PostEmail | null>(null);
  const totalCount = postsData?.count || 0;
  const queueSummary = postsStatus || {
    queued: 0,
    processing: 0,
    sent: 0,
    failed: 0,
    blocked: 0,
    cancelled: 0,
  };

  useEffect(() => {
    if (posts.selected && postsData?.data) {
      const found = postsData.data.find(
        (p: PostEmail) => createPostEmailKey(p) === posts.selected
      );
      setSelectedPost(found || null);
      return;
    }

    setSelectedPost(null);
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
          <div className="flex items-center gap-2 font-bold text-xl">
            <MailCheck />
            {t('ws-post-emails.sent_emails')}
          </div>
          <Separator className="my-1 bg-dynamic-purple/15" />
          <div className="font-semibold text-xl md:text-3xl">
            {queueSummary.sent}
            <span className="opacity-50">/{totalCount}</span>
          </div>
        </div>
        <div className="flex w-full flex-col items-center gap-1 rounded border border-dynamic-red/15 bg-dynamic-red/15 p-4 text-dynamic-red">
          <div className="flex items-center gap-2 font-bold text-xl">
            <Clock3 />
            {t('ws-post-emails.queued_emails')}
          </div>
          <Separator className="my-1 bg-dynamic-red/15" />
          <div className="font-semibold text-3xl">
            {queueSummary.queued}
            <span className="opacity-50">/{totalCount}</span>
          </div>
        </div>
        <div className="flex w-full flex-col items-center gap-1 rounded border border-dynamic-blue/15 bg-dynamic-blue/15 p-4 text-dynamic-blue">
          <div className="flex items-center gap-2 font-bold text-xl">
            <LoaderCircle />
            {t('ws-post-emails.processing_emails')}
          </div>
          <Separator className="my-1 bg-dynamic-blue/15" />
          <div className="font-semibold text-3xl">
            {queueSummary.processing}
            <span className="opacity-50">/{totalCount}</span>
          </div>
        </div>
        <div className="flex w-full flex-col items-center gap-1 rounded border border-dynamic-orange/15 bg-dynamic-orange/15 p-4 text-dynamic-orange">
          <div className="flex items-center gap-2 font-bold text-xl">
            <TriangleAlert />
            {t('ws-post-emails.failed_emails')}
          </div>
          <Separator className="my-1 bg-dynamic-orange/15" />
          <div className="font-semibold text-3xl">
            {queueSummary.failed +
              queueSummary.blocked +
              queueSummary.cancelled}
            <span className="opacity-50">/{totalCount}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="h-screen overflow-y-auto">
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
              queue_attempt_count: false,
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
        <PostDisplay postEmail={selectedPost} />
      </div>
    </div>
  );
}
