'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type {
  InternalEmail,
  User,
  UserPrivateDetails,
} from '@tuturuuu/types/db';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
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
  defaultLayout?: number[];
  defaultCollapsed?: boolean;
  data: InternalEmail[];
  searchParams: SearchParams;
  hasCredential: boolean;
  user: (User & UserPrivateDetails) | WorkspaceUser | null;
}

const PAGE_SIZE = 20;

export default function MailClientWrapper({
  wsId,
  defaultLayout,
  defaultCollapsed,
  data,
  hasCredential,
  user,
}: MailClientWrapperProps) {
  const [emails, setEmails] = useState<InternalEmail[]>(data);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setEmails(data);
    setPage(1);
    setHasMore(true);
  }, [data]);

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
    <div className="flex h-full flex-col">
      <div className="-m-4 flex-1 overflow-hidden bg-background/80 shadow-lg backdrop-blur-sm">
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
          user={user}
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
