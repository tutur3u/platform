'use client';

import { MailClient } from './_components/mail';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { InternalEmail } from '@tuturuuu/types/db';
import { useCallback, useEffect, useState } from 'react';

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
  postsData: InternalEmail[];
  postsCount: number;
  postsStatus: { count: number | null };
  searchParams: SearchParams;
  hasCredential: boolean;
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
  hasCredential,
}: MailClientWrapperProps) {
  const [emails, setEmails] = useState<InternalEmail[]>(postsData);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setEmails(postsData);
    setPage(1);
    setHasMore(true);
  }, [postsData]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;

    setLoading(true);
    try {
      const newEmails = await getWorkspaceMails(wsId, page, PAGE_SIZE);
      setEmails((prev) => [...prev, ...newEmails]);
      setHasMore(newEmails.length === PAGE_SIZE);
      setPage((prev) => prev + 1);
    } catch (error) {
      console.error('Failed to load emails:', error);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, page, wsId]);

  const mailsToShow = emails;

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
          hasCredential={hasCredential}
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
    .from('internal_emails')
    .select('*')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false })
    .range(start, end);

  if (error || !data) {
    console.error('Failed to fetch internal_emails', error);
    return [];
  }

  return data;
}
