import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import {
  getPendingWorkspaceInvitation,
  SatelliteWorkspaceInvitationCard,
} from '@tuturuuu/satellite/workspace-invitation';
import { getSidebarBehaviorUpdatedAt } from '@tuturuuu/satellite/workspace-layout-helpers';
import { RealtimeLogProvider } from '@tuturuuu/supabase/next/realtime-log-provider';
import { FinanceCommandProvider } from '@tuturuuu/ui/finance/command/finance-command-provider';
import { FinanceRouteProvider } from '@tuturuuu/ui/finance/finance-route-context';
import { FinanceLayoutControls } from '@tuturuuu/ui/finance/shared/finance-layout-controls';
import { QuickActions } from '@tuturuuu/ui/finance/shared/quick-actions';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { resolveSupportedCurrency } from '@tuturuuu/utils/currencies';
import {
  getPermissions,
  getWorkspace,
  getWorkspaceConfig,
} from '@tuturuuu/utils/workspace-helper';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';
import {
  SIDEBAR_BEHAVIOR_COOKIE_NAME,
  SIDEBAR_COLLAPSED_COOKIE_NAME,
} from '@/constants/common';
import { SidebarProvider } from '@/context/sidebar-context';
import NavbarActions from '../../navbar-actions';
import { UserNav } from '../../user-nav';
import { getNavigationLinks } from './navigation';
import { Structure } from './structure';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: ReactNode;
}

export default async function Layout({ children, params }: LayoutProps) {
  const { wsId: id } = await params;
  const requestHeaders = await headers();

  const user = await getSatelliteAppSessionUser('finance');
  if (!user?.id) redirect('/login');

  const workspace = await getWorkspace(id, { useAdmin: true, user });

  if (!workspace?.joined) {
    const invitation = await getPendingWorkspaceInvitation(id, requestHeaders);

    if (invitation) {
      return (
        <SatelliteWorkspaceInvitationCard
          afterDeclineHref="/"
          invitation={invitation}
          workspaceHref={`/${invitation.workspace.id}`}
        />
      );
    }
  }

  if (!workspace) redirect('/onboarding');
  if (!workspace?.joined) redirect('/');

  const wsId = workspace.id;
  const workspaceSlug = toWorkspaceSlug(wsId, {
    personal: !!workspace.personal,
  });
  const [permissions, currency] = await Promise.all([
    getPermissions({ user, wsId }),
    getWorkspaceConfig(wsId, 'DEFAULT_CURRENCY'),
  ]);
  const resolvedCurrency = resolveSupportedCurrency(currency);

  const cookieStore = await cookies();
  const collapsed = cookieStore.get(SIDEBAR_COLLAPSED_COOKIE_NAME);
  const behaviorCookie = cookieStore.get(SIDEBAR_BEHAVIOR_COOKIE_NAME);
  const sidebarBehaviorUpdatedAt = getSidebarBehaviorUpdatedAt(cookieStore);

  const rawBehavior = behaviorCookie?.value;
  const isValidBehavior = (
    value: string | undefined
  ): value is 'expanded' | 'collapsed' | 'hover' => {
    if (!value) return false;
    return ['expanded', 'collapsed', 'hover'].includes(value);
  };

  const sidebarBehavior: 'expanded' | 'collapsed' | 'hover' = isValidBehavior(
    rawBehavior
  )
    ? rawBehavior
    : 'expanded';

  let defaultCollapsed: boolean;
  if (sidebarBehavior === 'collapsed') {
    defaultCollapsed = true;
  } else if (sidebarBehavior === 'hover') {
    defaultCollapsed = true;
  } else {
    defaultCollapsed = collapsed ? JSON.parse(collapsed.value) : false;
  }

  return (
    <SidebarProvider
      initialBehavior={sidebarBehavior}
      initialBehaviorUpdatedAt={sidebarBehaviorUpdatedAt}
    >
      <Structure
        wsId={wsId}
        workspace={workspace}
        defaultCollapsed={defaultCollapsed}
        links={
          await getNavigationLinks({
            permissions: permissions ?? undefined,
            personalOrWsId: workspaceSlug,
          })
        }
        actions={
          <Suspense
            key={user.id}
            fallback={
              <div className="h-10 w-22 animate-pulse rounded-lg bg-foreground/5" />
            }
          >
            <NavbarActions />
          </Suspense>
        }
        userPopover={
          <Suspense
            key={user.id}
            fallback={
              <div className="h-10 w-10 animate-pulse rounded-lg bg-foreground/5" />
            }
          >
            <UserNav hideMetadata />
          </Suspense>
        }
      >
        <FinanceRouteProvider prefix="">
          <RealtimeLogProvider wsId={wsId}>
            <FinanceLayoutControls financePrefix="" />
            {children}
            <FinanceCommandProvider
              wsId={wsId}
              workspaceSlug={workspaceSlug}
              currency={resolvedCurrency}
              canCreateDebts={
                permissions?.containsPermission('manage_finance') ?? false
              }
              canCreateInvoices={
                permissions?.containsPermission('create_invoices') ?? false
              }
              canCreateRecurringTransactions={
                permissions?.containsPermission('create_transactions') ?? false
              }
              canCreateTransactions={
                permissions?.containsPermission('create_transactions') ?? false
              }
              canCreateWallets={
                permissions?.containsPermission('create_wallets') ?? false
              }
              canExportFinanceData={
                permissions?.containsPermission('export_finance_data') ?? false
              }
              canManageFinance={
                permissions?.containsPermission('manage_finance') ?? false
              }
              canUpdateWallets={
                permissions?.containsPermission('update_wallets') ?? false
              }
            />
            <QuickActions
              wsId={workspaceSlug}
              canCreateDebts={
                permissions?.containsPermission('manage_finance') ?? false
              }
              canCreateInvoices={
                permissions?.containsPermission('create_invoices') ?? false
              }
              canCreateRecurringTransactions={
                permissions?.containsPermission('create_transactions') ?? false
              }
              canCreateTransactions={
                permissions?.containsPermission('create_transactions') ?? false
              }
              canCreateWallets={
                permissions?.containsPermission('create_wallets') ?? false
              }
              canManageFinance={
                permissions?.containsPermission('manage_finance') ?? false
              }
            />
          </RealtimeLogProvider>
        </FinanceRouteProvider>
      </Structure>
    </SidebarProvider>
  );
}
