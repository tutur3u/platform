import NewInvoicePage from '@tuturuuu/ui/finance/invoices/new-invoice-page';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceInvoicesPage({ params }: Props) {
  const { wsId } = await params;

  return <NewInvoicePage wsId={wsId} />;
}
