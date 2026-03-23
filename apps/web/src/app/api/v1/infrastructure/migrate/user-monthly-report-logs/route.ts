import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  batchUpsert,
  createMigrationResponse,
  requireDevMode,
} from '../batch-upsert';

const IN_QUERY_BATCH_SIZE = 500;

interface ReportLogRow {
  id?: string;
  report_id?: string;
  user_id?: string;
  group_id?: string;
  title?: string;
  [key: string]: unknown;
}

function normalizeRows(data: unknown): ReportLogRow[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (row): row is ReportLogRow => !!row && typeof row === 'object'
  );
}

function reportKey({
  user_id,
  group_id,
  title,
}: Pick<ReportLogRow, 'user_id' | 'group_id' | 'title'>): string | null {
  if (!user_id || !group_id) {
    return null;
  }
  const normalizedTitle = typeof title === 'string' ? title : '';
  return `${user_id}::${group_id}::${normalizedTitle}`;
}

function chunkValues<T>(values: T[], chunkSize = IN_QUERY_BATCH_SIZE): T[][] {
  if (values.length === 0) return [];

  const safeChunkSize = Math.max(1, chunkSize);
  const chunks: T[][] = [];

  for (let i = 0; i < values.length; i += safeChunkSize) {
    chunks.push(values.slice(i, i + safeChunkSize));
  }

  return chunks;
}

export async function PUT(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const json = await req.json();
  const payload = normalizeRows(json?.data);
  const supabase = await createAdminClient({ noCookie: true });

  const incomingReportIds = Array.from(
    new Set(
      payload
        .map((row) => row.report_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  );

  const existingReportIds = new Set<string>();
  if (incomingReportIds.length > 0) {
    for (const idChunk of chunkValues(incomingReportIds)) {
      const { data: existingReports, error: existingReportsError } =
        await supabase
          .from('external_user_monthly_reports')
          .select('id')
          .in('id', idChunk);

      if (existingReportsError) {
        return Response.json(
          {
            message: 'Error migrating user monthly report logs',
            errorDetails: existingReportsError.message,
            errorCode: existingReportsError.code,
          },
          { status: 500 }
        );
      }

      for (const report of existingReports ?? []) {
        if (report.id) {
          existingReportIds.add(report.id);
        }
      }
    }
  }

  const pairKeys = new Set<string>();
  for (const row of payload) {
    if (
      row.report_id &&
      typeof row.report_id === 'string' &&
      existingReportIds.has(row.report_id)
    ) {
      continue;
    }

    if (typeof row.user_id === 'string' && typeof row.group_id === 'string') {
      pairKeys.add(`${row.user_id}::${row.group_id}`);
    }
  }

  const pairEntries = Array.from(pairKeys).flatMap((pairKey) => {
    const [userId, groupId] = pairKey.split('::');
    if (!userId || !groupId) {
      return [];
    }
    return [{ userId, groupId }];
  });
  const pairEntrySet = new Set(
    pairEntries.map(({ userId, groupId }) => `${userId}::${groupId}`)
  );
  const uniqueUserIds = [...new Set(pairEntries.map((entry) => entry.userId))];
  const uniqueGroupIds = [
    ...new Set(pairEntries.map((entry) => entry.groupId)),
  ];

  const reportIdByCompositeKey = new Map<string, string>();
  for (const userChunk of chunkValues(uniqueUserIds)) {
    for (const groupChunk of chunkValues(uniqueGroupIds)) {
      const { data: reports, error } = await supabase
        .from('external_user_monthly_reports')
        .select('id,user_id,group_id,title')
        .in('user_id', userChunk)
        .in('group_id', groupChunk);

      if (error) {
        return Response.json(
          {
            message: 'Error migrating user monthly report logs',
            errorDetails: error.message,
            errorCode: error.code,
          },
          { status: 500 }
        );
      }

      for (const report of reports ?? []) {
        if (!report.id || !report.user_id || !report.group_id) {
          continue;
        }
        if (!pairEntrySet.has(`${report.user_id}::${report.group_id}`)) {
          continue;
        }

        reportIdByCompositeKey.set(
          `${report.user_id}::${report.group_id}::${report.title ?? ''}`,
          report.id
        );
      }
    }
  }

  const sanitizedPayload = payload.flatMap((row) => {
    const reportId = row.report_id;
    if (
      typeof reportId === 'string' &&
      reportId.length > 0 &&
      existingReportIds.has(reportId)
    ) {
      return [row];
    }

    const key = reportKey(row);
    if (!key) {
      return [];
    }

    const resolvedReportId = reportIdByCompositeKey.get(key);
    if (!resolvedReportId) {
      return [];
    }

    return [
      {
        ...row,
        report_id: resolvedReportId,
      },
    ];
  });

  const result = await batchUpsert({
    table: 'external_user_monthly_report_logs',
    data: sanitizedPayload,
    onConflict: 'id',
  });
  return createMigrationResponse(result, 'user monthly report logs');
}
