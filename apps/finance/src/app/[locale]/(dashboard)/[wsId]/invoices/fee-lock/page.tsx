import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { normalizeFeeLockMonth } from '@/components/fee-lock/fee-lock-month';
import { FeeLockPage } from '@/components/fee-lock/fee-lock-page';
import { InvoiceAccessDenied } from '@/components/invoices/invoice-access-denied';
import { isFeeLockEnabled } from '@/lib/fee-lock-access';
import { getFinanceWorkspaceContext } from '@/lib/workspace';

interface Props {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<{ month?: string | string[] }>;
}

export default async function WorkspaceFeeLockPage({
  params,
  searchParams,
}: Props) {
  await connection();
  const { wsId } = await params;
  const context = await getFinanceWorkspaceContext(wsId);
  if (!context || !(await isFeeLockEnabled(context.wsId))) notFound();

  if (context.permissions.withoutPermission('view_invoices')) {
    return <InvoiceAccessDenied user={context.user} />;
  }

  const { month } = await searchParams;
  // Export needs both: the list itself (view_invoices) and the bulk download.
  const canExport = !['export_finance_data', 'view_invoices'].some(
    (permission) => context.permissions.withoutPermission(permission)
  );
  return (
    <FeeLockPage
      key={context.wsId}
      wsId={context.wsId}
      currency={context.currency}
      canExport={canExport}
      canEditTemplate={!context.permissions.withoutPermission('manage_finance')}
      initialMonth={normalizeFeeLockMonth(month)}
    />
  );
}
