import TransactionCategoriesPage from '@tuturuuu/ui/finance/transactions/categories/transactions-categories-page';
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
  searchParams: Promise<{
    q: string;
    page: string;
    pageSize: string;
    type?: string;
    minAmount?: string;
    maxAmount?: string;
  }>;
}

export default async function WorkspaceTransactionCategoriesPage({
  params,
  searchParams,
}: Props) {
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        return (
          <TransactionCategoriesPage
            wsId={wsId}
            searchParams={await searchParams}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}
