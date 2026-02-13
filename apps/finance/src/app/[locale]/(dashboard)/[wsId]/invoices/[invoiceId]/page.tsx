import InvoiceDetailsPage from '@tuturuuu/ui/finance/invoices/invoiceId/invoice-details-page';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

interface Props {
  params: Promise<{
    wsId: string;
    invoiceId: string;
    locale: string;
  }>;
}

export default async function WorkspaceInvoiceDetailsPage({ params }: Props) {
  const { wsId: id, invoiceId, locale } = await params;
  const workspace = await getWorkspace(id);
  if (!workspace) notFound();

  return (
    <Suspense>
      <InvoiceDetailsPage
        wsId={workspace.id}
        invoiceId={invoiceId}
        locale={locale}
        canUpdateInvoices
      />
    </Suspense>
  );
}
