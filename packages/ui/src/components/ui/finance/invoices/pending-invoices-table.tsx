'use client';

import { Loader2 } from '@tuturuuu/icons';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePendingInvoices } from './hooks';
import { pendingInvoiceColumns } from './pending-columns';

interface Props {
  wsId: string;
}

export function PendingInvoicesTable({ wsId }: Props) {
  const t = useTranslations('ws-invoices');
  const searchParams = useSearchParams();
  const page = searchParams.get('page') || '1';
  const pageSize = searchParams.get('pageSize') || '10';

  const { data, isLoading, error } = usePendingInvoices(wsId, page, pageSize);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <p className="text-muted-foreground text-sm">
            {t('loading_pending')}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-destructive text-sm">{t('error_loading')}</p>
      </div>
    );
  }

  const dataWithWsId = (data?.data || []).map((item) => ({
    ...item,
    ws_id: wsId,
  }));

  return (
    <CustomDataTable
      data={dataWithWsId}
      columnGenerator={pendingInvoiceColumns}
      namespace="pending-invoice-data-table"
      count={data?.count || 0}
      defaultVisibility={{
        user_id: false,
        group_id: false,
      }}
    />
  );
}
