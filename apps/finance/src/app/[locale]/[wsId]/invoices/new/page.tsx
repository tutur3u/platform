import NewInvoicePage from '@tuturuuu/ui/finance/invoices/new-invoice-page';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q: string;
    page: string;
    pageSize: string;
  }>;
}

export default async function WorkspaceInvoicesPage({
  params,
  searchParams,
}: Props) {
  const { wsId } = await params;
  const sp = await searchParams;

  return <NewInvoicePage wsId={wsId} searchParams={sp} />;
}
