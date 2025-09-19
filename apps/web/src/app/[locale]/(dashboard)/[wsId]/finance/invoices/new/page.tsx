import NewInvoicePage from '@tuturuuu/ui/finance/invoices/new-invoice-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'New',
  description: 'Manage New in the Invoices area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceInvoicesPage({ params }: Props) {
  const { wsId } = await params;

  return <NewInvoicePage wsId={wsId} />;
}
