import type { Metadata } from 'next';
import { redirectToFinanceApp } from '../../redirect';

export const metadata: Metadata = {
  title: 'Invoice Details',
  description:
    'View invoice details in the Finance area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    invoiceId: string;
    wsId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkspaceInvoiceDetailsPage({
  params,
  searchParams,
}: Props) {
  const { invoiceId, wsId } = await params;

  return redirectToFinanceApp({
    params: Promise.resolve({ wsId }),
    path: `invoices/${invoiceId}`,
    searchParams,
  });
}
