'use client';

import type {
  InventoryCostProfile,
  InventoryProductFormOptionsResponse,
  InventoryProductSummary,
} from '@tuturuuu/internal-api/inventory';
import { useTranslations } from 'next-intl';
import { CostingProfileDialog } from './costing-profile-dialog';
import {
  OperationsTable,
  type OperationsTableColumn,
} from './operations-table';
import { currency } from './operator-format';
import { useWorkspaceCurrency } from './workspace-currency';

export function CostingProfileList({
  options,
  products,
  profiles,
  wsId,
}: {
  options?: InventoryProductFormOptionsResponse;
  products?: InventoryProductSummary[];
  profiles: InventoryCostProfile[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.costing');
  const forms = useTranslations('inventory.operator.forms');
  const wsCurrency = useWorkspaceCurrency();

  if (profiles.length === 0) return null;

  const columns: OperationsTableColumn<InventoryCostProfile>[] = [
    {
      className: 'w-[22rem]',
      header: t('item'),
      key: 'item',
      render: (profile) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{profile.name}</p>
          <p className="mt-0.5 truncate text-muted-foreground text-xs">
            {profile.categoryName ?? t('uncategorized')}
          </p>
        </div>
      ),
      sortValue: (profile) => profile.name,
    },
    {
      className: 'w-[10rem]',
      header: t('retail'),
      key: 'retail',
      render: (profile) => (
        <span className="font-medium tabular-nums">
          {currency(profile.targetRetailPrice, profile.currency || wsCurrency)}
        </span>
      ),
      sortValue: (profile) => profile.targetRetailPrice,
    },
    {
      className: 'w-[8rem]',
      header: t('scenarios'),
      key: 'scenarios',
      render: (profile) => (
        <span className="tabular-nums">{profile.scenarios.length}</span>
      ),
      sortValue: (profile) => profile.scenarios.length,
    },
    {
      className: 'w-[9rem]',
      header: t('margin'),
      key: 'margin',
      render: (profile) => {
        const firstScenario = profile.scenarios[0];
        return (
          <span className="tabular-nums">
            {firstScenario
              ? `${firstScenario.metrics.grossMarginPercentage}%`
              : '—'}
          </span>
        );
      },
      sortValue: (profile) =>
        profile.scenarios[0]?.metrics.grossMarginPercentage,
    },
    {
      className: 'w-[9rem]',
      header: t('breakEven'),
      key: 'break-even',
      render: (profile) => (
        <span className="tabular-nums">
          {profile.scenarios[0]?.metrics.breakEvenQuantity ?? '—'}
        </span>
      ),
      sortValue: (profile) => profile.scenarios[0]?.metrics.breakEvenQuantity,
    },
    {
      cellClassName: 'text-right',
      className: 'w-[10rem] text-right',
      header: forms('actions'),
      key: 'actions',
      render: (profile) => (
        <CostingProfileDialog
          options={options}
          products={products}
          profile={profile}
          wsId={wsId}
        />
      ),
    },
  ];

  return (
    <OperationsTable
      ariaLabel={t('profiles')}
      columns={columns}
      getRowId={(profile) => profile.id}
      minWidth="min-w-[760px]"
      rows={profiles}
    />
  );
}
