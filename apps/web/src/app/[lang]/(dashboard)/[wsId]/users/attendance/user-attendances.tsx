import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import UserMonthAttendance from './user-month-attendance';
import { cookies } from 'next/headers';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { DataTablePagination } from '@/components/ui/custom/tables/data-table-pagination';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  month?: string; // yyyy-MM

  includedGroups?: string | string[];
  excludedGroups?: string | string[];
}

export default async function UserAttendances({
  wsId,
  searchParams,
}: {
  wsId: string;
  searchParams: SearchParams;
}) {
  const { data, count } = await getData(wsId, searchParams);
  const { page, pageSize } = searchParams;

  return (
    <>
      <DataTablePagination
        pageCount={Math.ceil(count / parseInt(pageSize ?? '3'))}
        pageIndex={parseInt(page ?? '1') - 1}
        pageSize={parseInt(pageSize ?? '3')}
        additionalSizes={[3, 6, 12, 24, 48]}
        count={count}
      />

      <div className="my-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {data
          .map((u) => ({
            ...u,
            href: `/${wsId}/users/database/${u.id}`,
          }))
          .map((user) => (
            <UserMonthAttendance key={user.id} wsId={wsId} user={user} />
          ))}
      </div>

      <DataTablePagination
        pageCount={Math.ceil(count / parseInt(pageSize ?? '3'))}
        pageIndex={parseInt(page ?? '1') - 1}
        pageSize={parseInt(pageSize ?? '3')}
        additionalSizes={[3, 6, 12, 24, 48]}
        count={count}
      />
    </>
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    includedGroups = [],
    excludedGroups = [],
    retry = true,
  }: SearchParams & { retry?: boolean } = {}
) {
  const supabase = createServerComponentClient({ cookies });

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
        search_query: q || null,
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

  return { data, count } as { data: WorkspaceUser[]; count: number };
}
