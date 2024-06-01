import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { verifyHasSecrets } from '@/lib/workspace-helper';
import MonthPicker from '@/components/ui/custom/month-picker';
import GeneralSearchBar from '@/components/inputs/GeneralSearchBar';
import UserMonthAttendance from './user-month-attendance';
import { DataTablePagination } from '@/components/ui/custom/tables/data-table-pagination';

export const dynamic = 'force-dynamic';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  month?: string; // yyyy-MM
}

interface Props {
  params: {
    wsId: string;
  };
  searchParams: SearchParams;
}

export default async function WorkspaceUsersPage({
  params: { wsId },
  searchParams,
}: Props) {
  await verifyHasSecrets(wsId, ['ENABLE_USERS'], `/${wsId}`);

  const { data, count } = await getData(wsId, searchParams);
  const users = data.map((u) => ({
    ...u,
    href: `/${wsId}/users/database/${u.id}`,
  }));

  const { page, pageSize } = searchParams;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start gap-2">
        <GeneralSearchBar className="w-full md:max-w-xs" />
        <MonthPicker />
      </div>

      <DataTablePagination
        pageCount={Math.ceil(count / parseInt(pageSize ?? '3'))}
        pageIndex={parseInt(page ?? '1') - 1}
        pageSize={parseInt(pageSize ?? '3')}
        additionalSizes={[3, 6, 12, 24, 48]}
        count={count}
      />

      <div className="my-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {users.map((user) => (
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
