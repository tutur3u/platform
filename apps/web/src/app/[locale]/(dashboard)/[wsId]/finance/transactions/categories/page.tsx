import { getWorkspaceConfig } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import CategoriesTagsTabs from './categories-tags-tabs';

export const metadata: Metadata = {
  title: 'Categories & Tags',
  description:
    'Manage categories and tags in the Finance area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceTransactionCategoriesPage({
  params,
}: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const currency = await getWorkspaceConfig(wsId, 'DEFAULT_CURRENCY');
        return <CategoriesTagsTabs wsId={wsId} currency={currency ?? 'USD'} />;
      }}
    </WorkspaceWrapper>
  );
}
