'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type { PostEmail } from '@tuturuuu/types/primitives/post-email';
import { useCallback, useEffect, useState } from 'react';
import { MailClient } from './_components/mail';

interface SearchParams {
  page?: string;
  pageSize?: string;
  includedGroups?: string | string[];
  excludedGroups?: string | string[];
  userId?: string;
}

interface MailClientWrapperProps {
  wsId: string;
  locale: string;
  defaultLayout?: number[];
  defaultCollapsed?: boolean;
  postsData: PostEmail[];
  postsCount: number;
  postsStatus: { count: number | null };
  searchParams: SearchParams;
}

export interface Mail {
  id: string;
  name: string;
  email: string;
  recipient: string;
  subject: string;
  text: string;
  date: string;
  read: boolean;
}

const PAGE_SIZE = 20;

export default function MailClientWrapper({
  wsId,
  locale,
  defaultLayout,
  defaultCollapsed,
  postsData,
  postsCount,
  postsStatus,
  searchParams,
}: MailClientWrapperProps) {
  const [emails, setEmails] = useState<Mail[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const loadEmails = useCallback(
    async (pageNum: number = 0, reset: boolean = false) => {
      try {
        setLoading(true);
        const newEmails = await getWorkspaceMails(wsId, pageNum, PAGE_SIZE);

        if (reset) {
          setEmails(newEmails);
        } else {
          setEmails((prev) => [...prev, ...newEmails]);
        }

        setHasMore(newEmails.length === PAGE_SIZE);
        setPage(pageNum);
      } catch (error) {
        console.error('Failed to load emails:', error);
      } finally {
        setLoading(false);
      }
    },
    [wsId]
  );

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      loadEmails(page + 1, false);
    }
  }, [loading, hasMore, page, loadEmails]);

  useEffect(() => {
    loadEmails(0, true);
  }, [loadEmails]);

  const mailsToShow = emails.length > 0 ? emails : [];

  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col">
      <div className="flex-1 overflow-hidden rounded-xl border bg-background/80 shadow-lg backdrop-blur-sm">
        <MailClient
          mails={mailsToShow}
          defaultLayout={defaultLayout}
          defaultCollapsed={defaultCollapsed}
          navCollapsedSize={4}
          onLoadMore={loadMore}
          hasMore={hasMore}
          loading={loading}
          wsId={wsId}
          locale={locale}
          postsData={postsData}
          postsCount={postsCount}
          postsStatus={postsStatus}
          searchParams={searchParams}
        />
      </div>
    </div>
  );
}

async function getWorkspaceMails(
  wsId: string,
  page: number = 0,
  pageSize: number = 20
) {
  const supabase = createClient();

  const start = page * pageSize;
  const end = start + pageSize - 1;

  const { data, error } = await supabase
    .from('sent_emails')
    .select('*')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false })
    .range(start, end);

  if (error || !data) {
    console.error('Failed to fetch sent_emails', error);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    name: row.source_name ?? 'Unknown',
    email: row.source_email ?? '',
    recipient: row.email ?? '',
    subject: row.subject ?? '',
    text: row.content ?? '',
    date: row.created_at ?? new Date().toISOString(),
    read: true,
    labels: [],
  }));
}
