import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { canViewInventoryCatalog } from '@tuturuuu/inventory-core/permissions';
import { StorefrontsClient } from './storefronts-client';

export const metadata: Metadata = {
  title: 'Storefronts',
  description: 'Manage storefront listings and product variants.',
};

interface Props {
  params: Promise<{ wsId: string }>;
}

export default async function WorkspaceStorefrontsPage({ params }: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const t = await getTranslations();
        const permissions = await getPermissions({ wsId });
        if (!permissions) notFound();

        if (!canViewInventoryCatalog(permissions)) {
          return (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <h2 className="font-semibold text-lg">
                  {t('ws-roles.inventory_access_denied')}
                </h2>
              </div>
            </div>
          );
        }

        return <StorefrontsClient wsId={wsId} />;
      }}
    </WorkspaceWrapper>
  );
}
