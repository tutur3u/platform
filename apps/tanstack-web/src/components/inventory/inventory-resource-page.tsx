'use client';

import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import type {
  ColumnGenerator,
  DataTableProps,
} from '@tuturuuu/ui/custom/tables/data-table';
import { Separator } from '@tuturuuu/ui/separator';
import type { ReactElement } from 'react';
import { useTranslations } from 'use-intl';
import {
  InventoryDataTableClient,
  type InventoryTableResource,
  type InventoryTableSearch,
} from './inventory-data-table-client';

type InventoryResourcePageProps<TData, TValue> = {
  accessDeniedDescriptionKey: string;
  canViewInventory: boolean;
  columnGenerator: ColumnGenerator<TData, TValue>;
  createForm?: ReactElement<FeatureSummaryFormProps>;
  defaultVisibility?: DataTableProps<TData, TValue>['defaultVisibility'];
  extraData?: DataTableProps<TData, TValue>['extraData'];
  featureNamespace: string;
  namespace: string;
  onSearchChange: (search: Partial<InventoryTableSearch>) => void;
  resource: InventoryTableResource;
  search: InventoryTableSearch;
  wsId: string;
};

type FeatureSummaryFormProps = {
  data?: unknown;
  forceDefault?: boolean;
  form?: ReactElement<FeatureSummaryFormProps>;
  onFinish?: () => void;
};

function InventoryAccessDenied({ descriptionKey }: { descriptionKey: string }) {
  const t = useTranslations();

  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h2 className="font-semibold text-lg">
          {t('ws-roles.inventory_access_denied')}
        </h2>
        <p className="text-muted-foreground">{t(descriptionKey)}</p>
      </div>
    </div>
  );
}

export function InventoryResourcePage<TData, TValue = unknown>({
  accessDeniedDescriptionKey,
  canViewInventory,
  columnGenerator,
  createForm,
  defaultVisibility,
  extraData,
  featureNamespace,
  namespace,
  onSearchChange,
  resource,
  search,
  wsId,
}: InventoryResourcePageProps<TData, TValue>) {
  const t = useTranslations();

  if (!canViewInventory) {
    return (
      <InventoryAccessDenied descriptionKey={accessDeniedDescriptionKey} />
    );
  }

  return (
    <>
      <FeatureSummary
        createDescription={t(`${featureNamespace}.create_description`)}
        createTitle={t(`${featureNamespace}.create`)}
        description={t(`${featureNamespace}.description`)}
        form={createForm}
        pluralTitle={t(`${featureNamespace}.plural`)}
        singularTitle={t(`${featureNamespace}.singular`)}
      />
      <Separator className="my-4" />
      <InventoryDataTableClient<TData, TValue>
        columnGenerator={columnGenerator}
        defaultVisibility={defaultVisibility}
        extraData={extraData}
        namespace={namespace}
        onSearchChange={onSearchChange}
        resource={resource}
        search={search}
        wsId={wsId}
      />
    </>
  );
}
