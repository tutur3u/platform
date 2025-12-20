import { createClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';
import { CustomDataTable } from '@/components/custom-data-table';
import { getAuditLogColumns } from './audit-log-columns';

interface AuditLogEntry {
  id: string;
  user_id: string;
  ws_id: string;
  archived: boolean;
  archived_until: string | null;
  creator_id: string;
  created_at: string;
  user_full_name?: string | null;
  creator_full_name?: string | null;
}

interface Props {
  wsId: string;
  page?: number;
  pageSize?: number;
}

const AuditLogSearchParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

export async function AuditLogTable({ wsId, page = 1, pageSize = 10 }: Props) {
  const supabase = await createClient();

  // Validate pagination params
  const validatedParams = AuditLogSearchParamsSchema.parse({ page, pageSize });

  const start = (validatedParams.page - 1) * validatedParams.pageSize;
  const end = validatedParams.page * validatedParams.pageSize;

  const {
    data: rawData,
    count,
    error,
  } = await supabase
    .from('workspace_user_status_changes')
    .select(
      `
      id,
      user_id,
      ws_id,
      archived,
      archived_until,
      creator_id,
      created_at,
      user:user_id (full_name, display_name),
      creator:creator_id (full_name, display_name)
    `,
      {
        count: 'exact',
      }
    )
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false })
    .range(start, end - 1);

  if (error) {
    console.error('Error fetching audit log:', error);
    return <div>Error loading audit log</div>;
  }

  const data: AuditLogEntry[] = (rawData || []).map((entry: any) => ({
    id: entry.id,
    user_id: entry.user_id,
    ws_id: entry.ws_id,
    archived: entry.archived,
    archived_until: entry.archived_until,
    creator_id: entry.creator_id,
    created_at: entry.created_at,
    user_full_name: entry.user?.full_name || entry.user?.display_name,
    creator_full_name: entry.creator?.full_name || entry.creator?.display_name,
  }));

  return (
    <CustomDataTable
      data={data}
      columnGenerator={getAuditLogColumns}
      namespace="audit-log-table"
      count={count || 0}
      defaultVisibility={{
        id: false,
        user_id: false,
        creator_id: false,
        ws_id: false,
      }}
    />
  );
}
