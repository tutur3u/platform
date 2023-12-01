import useTranslation from 'next-translate/useTranslation';
import { getWorkspace } from '@/lib/workspace-helper';
import Filters from './filters';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { AuditLog } from '@/types/primitives/audit-log';
import LogList from './log-list';
import { Separator } from '@/components/ui/separator';

export const dynamic = 'force-dynamic';

interface Props {
  params: {
    wsId?: string;
    page?: string;
    ops?: string[];
    userIds?: string[];
    itemsPerPage?: string;
  };
}

export default async function WorkspaceActivitiesPage({
  params: { wsId, page = '1', ops = [], userIds = [], itemsPerPage = '15' },
}: Props) {
  if (!wsId) notFound();

  const { t } = useTranslation('workspace-tabs');
  const ws = await getWorkspace(wsId);
  const logs = await getLogs(wsId, page, ops, userIds, itemsPerPage);

  const activitiesLabel = t('activities');

  return (
    <>
      {ws?.id && (
        <>
          <div className="border-border bg-foreground/5 rounded-lg border p-4">
            <h1 className="text-2xl font-bold">{activitiesLabel}</h1>
            <p className="text-foreground/80">
              {t('ws-activities:description')}
            </p>
          </div>
          <Separator className="my-4" />
        </>
      )}

      <div className="flex min-h-full w-full flex-col ">
        <Filters />
        <Separator className="mt-4" />
        {/* <PaginationIndicator
          activePage={activePage}
          setActivePage={setPage}
          itemsPerPage={itemsPerPage}
          totalItems={logsData?.count}
        /> */}

        <LogList logs={logs} />
      </div>
    </>
  );
}

async function getLogs(
  wsId: string,
  page: string,
  ops: string[],
  userIds: string[],
  itemsPerPage: string
) {
  const supabase = createServerComponentClient({ cookies });

  const queryBuilder = supabase
    .from('audit_logs')
    .select(
      'id, record_id, old_record_id, op, table_name, record, old_record, ts, auth_uid',
      {
        count: 'exact',
      }
    )
    .order('ts', { ascending: false })
    .eq('ws_id', wsId);

  if (ops && typeof ops === 'string') {
    queryBuilder.in('op', ops);
  }

  if (userIds && typeof userIds === 'string') {
    queryBuilder.in('auth_uid', userIds);
  }

  if (
    page &&
    itemsPerPage &&
    typeof page === 'string' &&
    typeof itemsPerPage === 'string'
  ) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(itemsPerPage);

    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;

    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data } = await queryBuilder;
  return data as AuditLog[];
}
