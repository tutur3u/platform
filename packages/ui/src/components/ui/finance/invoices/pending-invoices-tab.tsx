'use client';

import { CircleDashed } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { TabsTrigger } from '@tuturuuu/ui/tabs';
import { useWorkspaceConfig } from '../../../../hooks/use-workspace-config';
import { usePendingInvoicesCurrentMonthCount } from './hooks';

interface Props {
  wsId: string;
  label: string;
}

export function PendingInvoicesTab({ wsId, label }: Props) {
  const { data: groupByUserConfig, isLoading: isConfigLoading } =
    useWorkspaceConfig<string>(
      wsId,
      'INVOICE_GROUP_PENDING_INVOICES_BY_USER',
      'false'
    );

  const groupByUser = groupByUserConfig === 'true';

  const { data: currentMonthCount, isLoading } =
    usePendingInvoicesCurrentMonthCount(wsId, groupByUser, !isConfigLoading);

  return (
    <TabsTrigger value="pending" className="gap-2">
      <CircleDashed className="h-4 w-4" />
      {label}
      {!isLoading &&
        currentMonthCount !== undefined &&
        currentMonthCount > 0 && (
          <Badge
            variant="destructive"
            className="ml-1 h-5 min-w-5 justify-center px-1.5 text-xs"
          >
            {currentMonthCount}
          </Badge>
        )}
    </TabsTrigger>
  );
}
