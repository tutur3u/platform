import { FinanceRouteProvider } from '@tuturuuu/ui/finance/finance-route-context';
import { FinanceNumbersVisibilityToggle } from '@tuturuuu/ui/finance/shared/numbers-visibility-toggle';
import { QuickActions } from '@tuturuuu/ui/finance/shared/quick-actions';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import type { ReactNode } from 'react';
import { getWebFinanceWorkspaceContext } from '@/lib/finance-workspace-context';

interface WebFinanceLayoutProps {
  children: ReactNode;
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WebFinanceLayout({
  children,
  params,
}: WebFinanceLayoutProps) {
  const { wsId: id } = await params;
  const context = await getWebFinanceWorkspaceContext(id);
  const workspaceSlug = context
    ? toWorkspaceSlug(context.wsId, {
        personal: !!context.workspace.personal,
      })
    : id;

  return (
    <FinanceRouteProvider prefix="/finance">
      {context && (
        <div className="mb-4 flex justify-end">
          <FinanceNumbersVisibilityToggle />
        </div>
      )}
      {children}
      {context && (
        <QuickActions
          wsId={workspaceSlug}
          canCreateDebts={context.permissions.containsPermission(
            'manage_finance'
          )}
          canCreateInvoices={context.permissions.containsPermission(
            'create_invoices'
          )}
          canCreateRecurringTransactions={context.permissions.containsPermission(
            'create_transactions'
          )}
          canCreateTransactions={context.permissions.containsPermission(
            'create_transactions'
          )}
          canCreateWallets={context.permissions.containsPermission(
            'create_wallets'
          )}
          canManageFinance={context.permissions.containsPermission(
            'manage_finance'
          )}
        />
      )}
    </FinanceRouteProvider>
  );
}
