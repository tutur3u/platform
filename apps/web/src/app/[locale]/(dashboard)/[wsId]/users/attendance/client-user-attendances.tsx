'use client';

import UserMonthAttendance from './user-month-attendance';
import useSearchParams from '@/hooks/useSearchParams';
import { WorkspaceUser } from '@tuturuuu/types/db';
import { DataTablePagination } from '@tuturuuu/ui/custom/tables/data-table-pagination';
import { useTranslations } from 'next-intl';
import { FC } from 'react';

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

const ClientUserAttendances: FC<{
  wsId: string;
  searchParams: SearchParams;
  data: WorkspaceUser[];
  count: number;
}> = ({ wsId, searchParams: serverSearchParams, data, count }) => {
  const t = useTranslations();
  const searchParams = useSearchParams();

  // const queryPage = useMemo(
  //   () =>
  //     searchParams.get({
  //       key: 'page',

  //       fallbackValue: DEFAULT_PAGE,
  //     }) as string,
  //   [searchParams]
  // );

  // const queryPageSize = useMemo(
  //   () =>
  //     searchParams.get({
  //       key: 'pageSize',
  //       fallbackValue: DEFAULT_PAGE_SIZE,
  //     }) as string,
  //   [searchParams]
  // );

  // const [page, setPage] = useState(queryPage);
  // const [pageSize, setPageSize] = useState(queryPageSize);

  // const {
  //   isPending,
  //   isError,
  //   data: queryData,
  // } = useQuery({
  //   queryKey: [
  //     'workspaces',
  //     wsId,
  //     'users',
  //     'attendance',
  //     {
  //       page,
  //     },
  //   ],
  //   queryFn: () =>
  //     getData(wsId, {
  //       ...searchParams.getAll(),
  //       page,
  //     }),
  //   placeholderData: keepPreviousData,
  // });

  // const data = queryData?.data ?? [];
  // const count = queryData?.count ?? 0;

  const { page, pageSize } = serverSearchParams;

  return (
    <>
      <DataTablePagination
        t={t}
        pageCount={Math.ceil(count / parseInt(pageSize ?? DEFAULT_PAGE_SIZE))}
        pageIndex={parseInt(page ?? DEFAULT_PAGE) - 1}
        pageSize={parseInt(pageSize ?? DEFAULT_PAGE_SIZE)}
        additionalSizes={[3, 6, 12, 24, 48]}
        count={count}
        setParams={(params) => searchParams.set(params)}
      />
      <div className="my-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {data
          ?.map((u) => ({
            ...u,
            href: `/${wsId}/users/database/${u.id}`,
          }))
          .map((user) => (
            <UserMonthAttendance key={user.id} wsId={wsId} user={user} />
          ))}
      </div>
      {count > 0 && (
        <DataTablePagination
          t={t}
          pageCount={Math.ceil(count / parseInt(pageSize ?? DEFAULT_PAGE_SIZE))}
          pageIndex={parseInt(page ?? DEFAULT_PAGE) - 1}
          pageSize={parseInt(pageSize ?? DEFAULT_PAGE_SIZE)}
          additionalSizes={[3, 6, 12, 24, 48]}
          count={count}
          setParams={(params) => searchParams.set(params)}
        />
      )}
    </>
  );
};

export default ClientUserAttendances;
