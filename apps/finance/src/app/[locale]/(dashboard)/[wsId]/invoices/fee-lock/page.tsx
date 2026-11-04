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
  return (
    <FeeLockPage
      key={context.wsId}
      wsId={context.wsId}
      currency={context.currency}
      initialMonth={normalizeFeeLockMonth(month)}
    />
  );
}
