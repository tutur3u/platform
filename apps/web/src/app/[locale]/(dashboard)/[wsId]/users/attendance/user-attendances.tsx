import ClientUserAttendances from './client-user-attendances';
import { createClient } from '@tuturuuu/supabase/next/server';
import { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { ReactElement } from 'react';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  month?: string; // yyyy-MM

  includedGroups?: string | string[];
  excludedGroups?: string | string[];
}

const DEFAULT_PAGE = '1';
const DEFAULT_PAGE_SIZE = '24';

export default async function UserAttendances({
  wsId,
  searchParams,
}: {
  wsId: string;
  searchParams: SearchParams;
}): Promise<ReactElement> {
  const { data, count } = await getData(wsId, searchParams);

  return (
    <ClientUserAttendances
      wsId={wsId}
      data={data}
      count={count}
      searchParams={searchParams}
    />
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = DEFAULT_PAGE,
    pageSize = DEFAULT_PAGE_SIZE,
    includedGroups = [],
    excludedGroups = [],
    retry = true,
  }: SearchParams & { retry?: boolean } = {}
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .rpc(
      'get_workspace_users',
      {
        _ws_id: wsId,
        included_groups: Array.isArray(includedGroups)
          ? includedGroups
          : [includedGroups],
        excluded_groups: Array.isArray(excludedGroups)
          ? excludedGroups
          : [excludedGroups],
        search_query: q || '',
      },
      {
        count: 'exact',
      }
    )
    .select('*')
    .order('full_name', { ascending: true, nullsFirst: false });

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data, error, count } = await queryBuilder;

  if (error) {
    if (!retry) throw error;
    return getData(wsId, { q, pageSize, retry: false });
  }

  return { data, count } as unknown as { data: WorkspaceUser[]; count: number };
}
