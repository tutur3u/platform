import MailClientWrapper from '../client';
import { SIDEBAR_COLLAPSED_COOKIE_NAME } from '@/constants/common';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { InternalEmail } from '@tuturuuu/types/db';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { cookies } from 'next/headers';

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
  const { wsId } = await params;
  const searchParamsData = searchParams ? await searchParams : {};

  const layoutCookie = (await cookies()).get(
    'react-resizable-panels:layout:mail'
  );
  const collapsedCookie = (await cookies()).get(SIDEBAR_COLLAPSED_COOKIE_NAME);

  const defaultLayout = layoutCookie
    ? JSON.parse(layoutCookie.value)
    : undefined;
  const defaultCollapsed = collapsedCookie
    ? JSON.parse(collapsedCookie.value)
    : undefined;

  const { data } = await getMailsData(wsId, searchParamsData);
  const credential = await getWorkspaceMailCredential(wsId);
  const user = await getCurrentUser();

  return (
    <MailClientWrapper
      wsId={wsId}
      defaultLayout={defaultLayout}
      defaultCollapsed={defaultCollapsed}
      data={data}
      searchParams={searchParamsData}
      hasCredential={!!credential}
      user={user}
    />
  );
}

async function getMailsData(
  wsId: string,
  {
    page = '1',
    pageSize = '10',
    userId,
    retry = true,
  }: SearchParams & { retry?: boolean } = {}
) {
  const supabase = await createClient();

  let queryBuilder = supabase
    .from('internal_emails')
    .select(`*`, {
      count: 'exact',
    })
    .eq('ws_id', wsId);

  if (userId) {
    queryBuilder = queryBuilder.eq('user_id', userId);
  }

  if (page && pageSize) {
    const parsedPage = Number.parseInt(page);
    const parsedSize = Number.parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize - 1;
    queryBuilder = queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder.order('created_at', {
    ascending: false,
  });

  if (error) {
    if (!retry) throw error;
    return getMailsData(wsId, { pageSize, retry: false });
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
