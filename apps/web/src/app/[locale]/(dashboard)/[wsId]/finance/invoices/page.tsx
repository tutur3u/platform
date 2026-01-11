import InvoicesPage from '@tuturuuu/ui/finance/invoices/invoice-page';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { deleteInvoice } from './actions';

export const metadata: Metadata = {
  title: 'Invoices',
  description:
    'Manage Invoices in the Finance area of your Tuturuuu workspace.',
};

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
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const { withoutPermission, containsPermission } = await getPermissions({
          wsId,
        });
        if (withoutPermission('view_invoices')) notFound();

        const canCreateInvoices = containsPermission('create_invoices');
        const canDeleteInvoices = containsPermission('delete_invoices');

        return (
          <InvoicesPage
            params={params}
            searchParams={searchParams}
            canCreateInvoices={canCreateInvoices}
            canDeleteInvoices={canDeleteInvoices}
            deleteInvoiceAction={deleteInvoice}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}
