import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { InventoryStatisticsClient } from './inventory-statistics-client';

export const metadata: Metadata = {
  title: 'Inventory',
  description: 'Manage Inventory in your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function InventoryPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const permissions = await getPermissions({
          wsId,
        });
        if (!permissions) notFound();
        const { containsPermission } = permissions;
        const t = await getTranslations();

        if (!containsPermission('view_inventory')) {
          return (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <h2 className="font-semibold text-lg">
                  {t('ws-roles.inventory_access_denied')}
                </h2>
                <p className="text-muted-foreground">
                  {t('ws-roles.inventory_access_denied_description')}
                </p>
              </div>
            </div>
          );
        }

        return <InventoryStatisticsClient wsId={wsId} />;
      }}
    </WorkspaceWrapper>
  );
}
