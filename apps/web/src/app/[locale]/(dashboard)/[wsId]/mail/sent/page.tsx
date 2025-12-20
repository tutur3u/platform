import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { InternalEmail } from '@tuturuuu/types';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { SIDEBAR_COLLAPSED_COOKIE_NAME } from '@/constants/common';
import MailClientWrapper from '../client';

export const metadata: Metadata = {
  title: 'Sent',
  description: 'Manage Sent in the Mail area of your Tuturuuu workspace.',
};

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
  const wsId = workspace?.id;

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

  const { data } = await getMailsData(searchParamsData);
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
    const end = parsedPage * parsedSize - 1;
    queryBuilder = queryBuilder.range(start, end).limit(parsedSize);
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
