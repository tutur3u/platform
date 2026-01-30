import InvoiceDetailsPage from '@tuturuuu/ui/finance/invoices/invoiceId/invoice-details-page';
import {
  getPermissions,
  getWorkspaceConfig,
} from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import WorkspaceWrapper from '@/components/workspace-wrapper';

export const metadata: Metadata = {
  title: 'Invoice Details',
  description:
    'Manage Invoice Details in the Invoices area of your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
    invoiceId: string;
    locale: string;
  }>;
}

export default async function WorkspaceInvoiceDetailsPage({ params }: Props) {
  const { invoiceId, locale } = await params;

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => {
        const { withoutPermission, containsPermission } = await getPermissions({
          wsId,
        });
        if (withoutPermission('view_invoices')) notFound();

        const canUpdateInvoices = containsPermission('update_invoices');
        const currency =
          (await getWorkspaceConfig(wsId, 'DEFAULT_CURRENCY')) || 'USD';

        return (
          <InvoiceDetailsPage
            wsId={wsId}
            locale={locale}
            invoiceId={invoiceId}
            canUpdateInvoices={canUpdateInvoices}
            currency={currency}
          />
        );
      }}
    </WorkspaceWrapper>
  );
}
