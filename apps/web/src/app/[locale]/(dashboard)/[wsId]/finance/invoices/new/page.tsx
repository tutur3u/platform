import NewInvoicePage from '@tuturuuu/ui/finance/invoices/new-invoice-page';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';

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
  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const permissions = await getPermissions({
          wsId,
        });
        if (!permissions) notFound();
        const { withoutPermission } = permissions;
        if (withoutPermission('create_invoices')) notFound();

        return <NewInvoicePage wsId={wsId} />;
      }}
    </WorkspaceWrapper>
  );
}
