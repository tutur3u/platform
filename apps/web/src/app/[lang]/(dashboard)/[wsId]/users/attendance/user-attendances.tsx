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
    pageSize = '3',
    month = new Date().toISOString().slice(0, 7),
    retry = true,
  }: SearchParams & { retry?: boolean }
) {
  const supabase = createServerComponentClient({ cookies });

  const startDate = new Date(month);
  const endDate = new Date(
    new Date(startDate).setMonth(startDate.getMonth() + 1)
  );

  const queryBuilder = supabase
    .from('workspace_users')
    .select('*, user_group_attendance(date, status)', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .gte('user_group_attendance.date', startDate.toISOString())
    .lt('user_group_attendance.date', endDate.toISOString())
    .order('full_name', { ascending: true, nullsFirst: false });

  if (q) queryBuilder.ilike('full_name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data: rawData, error, count } = await queryBuilder;

  const data = rawData?.map((u) => ({
    ...u,
    attendance: u.user_group_attendance,
  })) as WorkspaceUser[];

  if (error) {
    if (!retry) throw error;
    return getData(wsId, { q, pageSize, retry: false });
  }

  return { data, count } as { data: WorkspaceUser[]; count: number };
}
