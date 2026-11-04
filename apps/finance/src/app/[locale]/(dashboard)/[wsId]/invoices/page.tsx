import InvoicesPage from '@tuturuuu/ui/finance/invoices/invoice-page';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { InvoiceAccessDenied } from '@/components/invoices/invoice-access-denied';
import { isFeeLockEnabled } from '@/lib/fee-lock-access';
import { getFinanceWorkspaceContext } from '@/lib/workspace';

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
    walletIds: string | string[];
    walletId: string;
  }>;
}

export default async function WorkspaceInvoicesPage({
  params,
  searchParams,
}: Props) {
  await connection();

  const { wsId: id } = await params;
  const context = await getFinanceWorkspaceContext(id);
  if (!context) {
    notFound();
  }

  if (context.permissions.withoutPermission('view_invoices')) {
    return <InvoiceAccessDenied user={context.user} />;
  }

  const [feeLockEnabled, t] = await Promise.all([
    isFeeLockEnabled(context.wsId),
    getTranslations('ws-fee-lock'),
  ]);

  return (
    <Suspense>
      <InvoicesPage
        params={Promise.resolve({ wsId: context.wsId })}
        searchParams={searchParams}
        canCreateInvoices={context.permissions.containsPermission(
          'create_invoices'
        )}
        canDeleteInvoices={context.permissions.containsPermission(
          'delete_invoices'
        )}
        currency={context.currency}
        feeLockHref={
          feeLockEnabled ? `/${context.wsId}/invoices/fee-lock` : undefined
        }
        feeLockLabel={t('open_from_pending')}
        financePrefix=""
        permissions={context.permissions}
        userId={context.user.id}
        workspace={context.workspace}
      />
    </Suspense>
  );
}
