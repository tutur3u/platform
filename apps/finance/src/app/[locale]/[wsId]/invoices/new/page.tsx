import NewInvoicePage from '@tuturuuu/ui/finance/invoices/new-invoice-page';
import { Suspense } from 'react';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function WorkspaceInvoicesPage({ params }: Props) {
  const { wsId } = await params;

  return (
    <Suspense>
      <NewInvoicePage wsId={wsId} />
    </Suspense>
  );
}
