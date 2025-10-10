import InvoicesPage from '@tuturuuu/ui/finance/invoices/invoice-page';
import type { Metadata } from 'next';
import WorkspaceWrapper from '@/components/workspace-wrapper';

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
        return <InvoicesPage wsId={wsId} searchParams={sp} />;
      }}
    </WorkspaceWrapper>
  );
}
