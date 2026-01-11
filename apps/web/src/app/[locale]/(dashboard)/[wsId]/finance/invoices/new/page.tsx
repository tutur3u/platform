import { createClient } from '@tuturuuu/supabase/next/server';
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
        const { withoutPermission } = await getPermissions({
          wsId,
        });
        if (withoutPermission('create_invoices')) notFound();

        const supabase = await createClient();
        const { data: config } = await supabase
          .from('workspace_configs')
          .select('value')
          .eq('ws_id', wsId)
          .eq('id', 'default_wallet_id')
          .single();

        const defaultWalletId = config?.value as string | undefined;

        return <NewInvoicePage wsId={wsId} defaultWalletId={defaultWalletId} />;
      }}
    </WorkspaceWrapper>
  );
}
