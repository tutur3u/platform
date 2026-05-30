import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { PromotionsPageClient } from './promotions-page-client';

export const metadata: Metadata = {
  title: 'Promotions',
  description:
    'Manage Promotions in the Inventory area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspacePromotionsPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const t = await getTranslations();
        const permissions = await getPermissions({
          wsId,
        });
        if (!permissions) notFound();
        const { containsPermission } = permissions;

        if (!containsPermission('view_inventory')) {
          return (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <h2 className="font-semibold text-lg">
                  {t('ws-roles.inventory_access_denied')}
                </h2>
                <p className="text-muted-foreground">
                  {t('ws-roles.inventory_promotions_access_denied_description')}
                </p>
              </div>
            </div>
          );
        }

        const canCreateInventory = containsPermission('create_inventory');
        const canUpdateInventory = containsPermission('update_inventory');
        const canDeleteInventory = containsPermission('delete_inventory');

        return (
          <PromotionsPageClient
            wsId={wsId}
            canCreateInventory={canCreateInventory}
            canUpdateInventory={canUpdateInventory}
            canDeleteInventory={canDeleteInventory}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}
