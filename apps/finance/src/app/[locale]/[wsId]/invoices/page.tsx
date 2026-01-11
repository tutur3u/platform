import InvoicesPage from '@tuturuuu/ui/finance/invoices/invoice-page';
import { Suspense } from 'react';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q: string;
    page: string;
    pageSize: string;
    start: string;
    end: string;
    userIds: string | string[];
  }>;
}

export default async function WorkspaceInvoicesPage({
  params,
  searchParams,
}: Props) {
  return (
    <Suspense>
      <InvoicesPage params={params} searchParams={searchParams} />
    </Suspense>
  );
}
