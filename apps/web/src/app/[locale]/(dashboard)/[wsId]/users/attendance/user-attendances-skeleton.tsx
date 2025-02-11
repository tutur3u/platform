import UserMonthAttendanceSkeleton from './user-month-attendance-skeleton';
import { DataTablePagination } from '@tutur3u/ui/custom/tables/data-table-pagination';

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
  month?: string; // yyyy-MM
}

export default async function UserAttendancesSkeleton({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const pageIndex = parseInt(searchParams.page ?? '1') - 1;
  const pageSize = parseInt(searchParams.pageSize ?? '6');

  return (
    <>
      <DataTablePagination
        pageIndex={pageIndex}
        pageSize={pageSize}
        additionalSizes={[3, 6, 12, 24, 48]}
      />

      <div className="my-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: pageSize }).map((_, i) => (
          <UserMonthAttendanceSkeleton key={i} />
        ))}
      </div>

      <DataTablePagination
        pageIndex={pageIndex}
        pageSize={pageSize}
        additionalSizes={[3, 6, 12, 24, 48]}
      />
    </>
  );
}
