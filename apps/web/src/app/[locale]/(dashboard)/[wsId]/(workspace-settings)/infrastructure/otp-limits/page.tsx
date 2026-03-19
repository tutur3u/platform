import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Json } from '@tuturuuu/types';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CustomDataTable } from '@/components/custom-data-table';
import { enforceInfrastructureRootWorkspace } from '../enforce-infrastructure-root';
import OtpLimitResetClient from './client';
import {
  getOtpLimitResetColumns,
  type OtpLimitResetHistoryEntry,
} from './columns';

export const metadata: Metadata = {
  title: 'OTP Limits',
  description: 'Reset OTP limits for specific emails in infrastructure.',
};

interface SearchParams {
  q?: string;
  page?: string;
  pageSize?: string;
}

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<SearchParams>;
}

interface ResetHistoryRow {
  id: string;
  created_at: string;
  email: string | null;
  ip_address: string;
  metadata: Json | null;
}

function extractAdminUserId(metadata: Json | null): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const metadataRecord = metadata as Record<string, unknown>;
  const adminUserId = metadataRecord.admin_user_id;
  return typeof adminUserId === 'string' ? adminUserId : null;
}

function toHistoryEntry(
  row: ResetHistoryRow,
  adminNames: Map<string, string | null>
): OtpLimitResetHistoryEntry {
  const adminUserId = extractAdminUserId(row.metadata);

  return {
    ...row,
    metadata:
      row.metadata &&
      typeof row.metadata === 'object' &&
      !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null,
    admin_display_name: adminUserId
      ? (adminNames.get(adminUserId) ?? null)
      : null,
  };
}

export default async function OtpLimitsPage({ params, searchParams }: Props) {
  const { wsId } = await params;
  await enforceInfrastructureRootWorkspace(wsId);

  const t = await getTranslations();
  const { data, count } = await getData(await searchParams);

  return (
    <>
      <FeatureSummary
        pluralTitle={t('otp-limit-resets.plural')}
        singularTitle={t('otp-limit-resets.singular')}
        description={t('otp-limit-resets.description')}
        createTitle={t('otp-limit-resets.create')}
        createDescription={t('otp-limit-resets.create_description')}
        form={<OtpLimitResetClient />}
      />
      <Separator className="my-4" />
      <CustomDataTable
        data={data}
        namespace="otp-limit-resets-data-table"
        columnGenerator={getOtpLimitResetColumns}
        count={count}
        defaultVisibility={{
          metadata: false,
        }}
      />
    </>
  );
}

async function getData({
  q,
  page = '1',
  pageSize = '10',
  retry = true,
}: SearchParams & { retry?: boolean } = {}): Promise<{
  data: OtpLimitResetHistoryEntry[];
  count: number;
}> {
  const sbAdmin = await createAdminClient();
  const parsedPage = Number.parseInt(page, 10);
  const parsedPageSize = Number.parseInt(pageSize, 10);
  const start = (parsedPage - 1) * parsedPageSize;
  const end = start + parsedPageSize - 1;

  let queryBuilder = sbAdmin
    .from('abuse_events')
    .select('id, created_at, email, ip_address, metadata', { count: 'exact' })
    .eq('event_type', 'otp_limit_reset' as never)
    .order('created_at', { ascending: false })
    .range(start, end);

  if (q) {
    queryBuilder = queryBuilder.ilike('email', `%${q}%`);
  }

  const { data, error, count } = await queryBuilder;

  if (error) {
    if (!retry) {
      throw error;
    }

    return getData({
      q,
      page,
      pageSize,
      retry: false,
    });
  }

  const rows = (data ?? []) as ResetHistoryRow[];
  const adminUserIds = Array.from(
    new Set(
      rows
        .map((row) => extractAdminUserId(row.metadata))
        .filter((value): value is string => !!value)
    )
  );

  const adminNames = new Map<string, string | null>();
  if (adminUserIds.length > 0) {
    const { data: admins } = await sbAdmin
      .from('users')
      .select('id, display_name')
      .in('id', adminUserIds);

    for (const admin of admins ?? []) {
      adminNames.set(admin.id, admin.display_name);
    }
  }

  return {
    data: rows.map((row) => toHistoryEntry(row, adminNames)),
    count: count ?? 0,
  };
}
