import NewInvoicePage from '@tuturuuu/ui/finance/invoices/new-invoice-page';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { Suspense } from 'react';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
  }>;
}

export default async function WorkspaceNewInvoicePage({ params }: Props) {
  const { wsId: id } = await params;
  const workspace = await getWorkspace(id);

  return (
    <Suspense>
      <NewInvoicePage wsId={workspace.id} />
    </Suspense>
  );
}
