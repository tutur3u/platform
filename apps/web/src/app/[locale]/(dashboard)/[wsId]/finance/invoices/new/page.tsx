import type { Metadata } from 'next';
import { redirectToFinanceApp } from '../../redirect';

export const metadata: Metadata = {
  title: 'Create Invoice',
  description:
    'Create an invoice in the Finance area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkspaceNewInvoicePage({
  params,
  searchParams,
}: Props) {
  return redirectToFinanceApp({
    params,
    path: 'invoices/new',
    searchParams,
  });
}
