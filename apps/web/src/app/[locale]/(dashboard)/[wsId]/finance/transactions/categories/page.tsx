import TransactionCategoriesPage from '@tuturuuu/ui/finance/transactions/categories/transactions-categories-page';
import { getWorkspaceConfig } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import WorkspaceWrapper from '@/components/workspace-wrapper';

export const metadata: Metadata = {
  title: 'Categories',
  description:
    'Manage Categories in the Transactions area of your Tuturuuu workspace.',
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
        return (
          <TransactionCategoriesPage wsId={wsId} currency={currency ?? 'USD'} />
        );
      }}
    </WorkspaceWrapper>
  );
}
