import { FinanceRouteProvider } from '@tuturuuu/ui/finance/finance-route-context';
import { FinanceCommandProvider } from '@tuturuuu/ui/finance/command/finance-command-provider';
import { FinanceLayoutControls } from '@tuturuuu/ui/finance/shared/finance-layout-controls';
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
      {context && <FinanceLayoutControls financePrefix="/finance" />}
      {children}
      {context && (
        <>
          <FinanceCommandProvider
            wsId={context.wsId}
            workspaceSlug={workspaceSlug}
            currency={context.currency}
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
            canExportFinanceData={context.permissions.containsPermission(
              'export_finance_data'
            )}
            canManageFinance={context.permissions.containsPermission(
              'manage_finance'
            )}
            canUpdateWallets={context.permissions.containsPermission(
              'update_wallets'
            )}
          />
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
        </>
      )}
    </FinanceRouteProvider>
  );
}
