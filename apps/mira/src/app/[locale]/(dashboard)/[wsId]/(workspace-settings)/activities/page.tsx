import LogList from './log-list';
import { AuditLog } from '@/types/primitives/audit-log';
import { createClient } from '@/utils/supabase/server';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId?: string;
    page?: string;
    ops?: ('INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE' | null)[];
    userIds?: string[];
    itemsPerPage?: string;
  }>;
}

export default async function WorkspaceActivitiesPage({ params }: Props) {
  const {
    wsId,
    page = '1',
    ops = [],
    userIds = [],
    itemsPerPage = '15',
  } = await params;

  if (!wsId) notFound();

  const logs = await getLogs(wsId, page, ops, userIds, itemsPerPage);

  return (
    <div className="flex min-h-full w-full flex-col">
      <LogList logs={logs} />
    </div>
  );
}

async function getLogs(
  wsId: string,
  page: string,
  ops: ('INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE' | null)[],
  userIds: string[],
  itemsPerPage: string
) {
  const supabase = await createClient();

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

  if (ops) {
    queryBuilder.in('op', ops);
  }

  if (userIds) {
    queryBuilder.in('auth_uid', userIds);
  }

  if (page && itemsPerPage) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(itemsPerPage);

    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;

    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data } = await queryBuilder;
  return data as AuditLog[];
}
