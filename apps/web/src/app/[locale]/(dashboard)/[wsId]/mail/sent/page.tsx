import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { InternalEmail } from '@tuturuuu/types/db';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { cookies } from 'next/headers';
import { SIDEBAR_COLLAPSED_COOKIE_NAME } from '@/constants/common';
import { notFound } from 'next/navigation';
import MailClientWrapper from '../client';

interface SearchParams {
  page?: string;
  pageSize?: string;
  userId?: string;
}

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
  searchParams?: Promise<SearchParams>;
}

export default async function MailPage({ params, searchParams }: Props) {
  const { wsId: id } = await params;
  const workspace = await getWorkspace(id);
  const wsId = workspace.id;
  const user = await getCurrentUser();
  if (!workspace || !user) notFound();

  const cookiesStore = await cookies();
  const collapsed = cookiesStore.get(SIDEBAR_COLLAPSED_COOKIE_NAME);
  const behaviorCookie = cookiesStore.get(SIDEBAR_BEHAVIOR_COOKIE_NAME);
  const rawBehavior = behaviorCookie?.value;

  const isValidBehavior = (
    value: string | undefined
  ): value is 'expanded' | 'collapsed' | 'hover' => {
    if (!value) return false;
    return ['expanded', 'collapsed', 'hover'].includes(value);
  };

  const sidebarBehavior: 'expanded' | 'collapsed' | 'hover' = isValidBehavior(
    rawBehavior
  )
    ? rawBehavior
    : 'expanded';

  let defaultCollapsed: boolean;
  if (sidebarBehavior === 'collapsed') {
    defaultCollapsed = true;
  } else if (sidebarBehavior === 'hover') {
    defaultCollapsed = true;
  } else {
    try {
      defaultCollapsed = collapsed ? JSON.parse(collapsed.value) : false;
    } catch {
      defaultCollapsed = false;
    }
  }

  const searchParamsData = await searchParams;
  const { data } = await getMailsData(searchParamsData);
  const credential = await getWorkspaceMailCredential(wsId);

  return (
    <MailClientWrapper
      wsId={wsId}
      defaultCollapsed={defaultCollapsed}
      data={data}
      searchParams={searchParamsData || {}}
      hasCredential={!!credential}
      user={user}
    />
  );
}

async function getMailsData({
  page = '1',
  pageSize = '10',
  userId,
  retry = true,
}: SearchParams & { retry?: boolean } = {}) {
  const supabase = await createClient();

  let queryBuilder = supabase.from('internal_emails').select(`*`, {
    count: 'exact',
  });

  if (userId) {
    queryBuilder = queryBuilder.eq('user_id', userId);
  }

  if (page && pageSize) {
    const parsedPage = Number.parseInt(page, 10);
    const parsedSize = Number.parseInt(pageSize, 10);
    const start = (parsedPage - 1) * parsedSize;
    const end = start + parsedSize - 1;
    queryBuilder = queryBuilder.range(start, end);
  }

  const { data, error, count } = await queryBuilder.order('created_at', {
    ascending: false,
  });

  if (error) {
    if (!retry) throw error;
    return getMailsData({ pageSize, retry: false });
  }

  return {
    data,
    count: count || 0,
  } as { data: InternalEmail[]; count: number };
}

async function getWorkspaceMailCredential(wsId: string) {
  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from('workspace_email_credentials')
    .select('*')
    .eq('ws_id', wsId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}
