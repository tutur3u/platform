import { verifyHasSecrets } from '@/lib/workspace-helper';
import MonthPicker from '@/components/ui/custom/month-picker';
import GeneralSearchBar from '@/components/inputs/GeneralSearchBar';
import { Suspense } from 'react';
import UserAttendances from './user-attendances';
import UserAttendancesSkeleton from './user-attendances-skeleton';

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

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start gap-2">
        <GeneralSearchBar className="w-full md:max-w-xs" />
        <MonthPicker />
      </div>

      <Suspense
        fallback={<UserAttendancesSkeleton searchParams={searchParams} />}
      >
        <UserAttendances wsId={wsId} searchParams={searchParams} />
      </Suspense>
    </>
  );
}
