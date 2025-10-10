import InvoicesPage from '@tuturuuu/ui/finance/invoices/invoice-page';
import type { Metadata } from 'next';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';

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
  }>;
}

export default async function WorkspaceInvoicesPage({
  params,
  searchParams,
}: Props) {

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const sp = await searchParams;
        const { withoutPermission, containsPermission } = await getPermissions({
          wsId,
        });
        if (withoutPermission('view_invoices')) notFound();

        const canCreateInvoices = containsPermission('create_invoices');
        const canDeleteInvoices = containsPermission('delete_invoices');

        return <InvoicesPage wsId={wsId} searchParams={sp} canCreateInvoices={canCreateInvoices} canDeleteInvoices={canDeleteInvoices} />;
      }}
    </WorkspaceWrapper>
  );
}
