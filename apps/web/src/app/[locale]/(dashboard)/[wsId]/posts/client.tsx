'use client';

import type { InternalEmail } from '@tuturuuu/types/db';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { MailWarning, Send } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import { CustomDataTable } from '@/components/custom-data-table';
import { getPostEmailColumns } from './columns';
import PostsFilters from './filters';
import { createPostEmailKey, usePosts } from './use-posts';

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
  postsData,
  postsCount,
  postsStatus,
  searchParams,
}: {
  wsId: string;
  locale: string;
  postsData: InternalEmail[];
  postsCount: number;
  postsStatus: { count: number | null };
  searchParams: SearchParams;
}) {
  const t = useTranslations();
  const [posts, setPosts] = usePosts();

  const PostsContent = () => (
    <div className="space-y-6 p-6">
      <FeatureSummary
        pluralTitle={t('ws-post-emails.plural')}
        singularTitle={t('ws-post-emails.singular')}
        description={t('ws-post-emails.description')}
      />

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="flex w-full flex-col items-center gap-1 rounded border border-dynamic-purple/15 bg-dynamic-purple/15 p-4 text-dynamic-purple">
          <div className="flex items-center gap-2 font-bold text-xl">
            <Send />
            {t('ws-post-emails.sent_emails')}
          </div>
          <Separator className="my-1 bg-dynamic-purple/15" />
          <div className="font-semibold text-xl md:text-3xl">
            {postsStatus.count || 0}
            <span className="opacity-50">/{postsCount || 0}</span>
          </div>
        </div>
        <div className="flex w-full flex-col items-center gap-1 rounded border border-dynamic-red/15 bg-dynamic-red/15 p-4 text-dynamic-red">
          <div className="flex items-center gap-2 font-bold text-xl">
            <MailWarning />
            {t('ws-post-emails.pending_emails')}
          </div>
          <Separator className="my-1 bg-dynamic-red/15" />
          <div className="font-semibold text-3xl">
            {(postsCount || 0) - (postsStatus.count || 0)}
            <span className="opacity-50">/{postsCount || 0}</span>
          </div>
        </div>
      </div>

      <CustomDataTable
        data={postsData}
        namespace="post-email-data-table"
        columnGenerator={getPostEmailColumns}
        extraData={{ locale }}
        count={postsCount}
        filters={
          <PostsFilters wsId={wsId} searchParams={searchParams} noExclude />
        }
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
  );

  return <PostsContent />;
}
