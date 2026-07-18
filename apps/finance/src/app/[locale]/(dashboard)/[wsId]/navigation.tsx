import {
  ChartArea,
  ChartColumn,
  CreditCard,
  FileText,
  HandCoins,
  LayoutDashboard,
  Receipt,
  Repeat,
  Tags,
  Wallet,
} from '@tuturuuu/icons';
import { createWorkspaceMembersNavLink } from '@tuturuuu/satellite/workspace-settings';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import type { PermissionsResult } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';

export type { NavLink } from '@tuturuuu/ui/custom/navigation';

export async function getNavigationLinks({
  permissions,
  personalOrWsId,
}: {
  permissions?: PermissionsResult;
  personalOrWsId: string;
}): Promise<(NavLink | null)[]> {
  const t = await getTranslations();
  const withoutPermission = (
    permission: Parameters<PermissionsResult['withoutPermission']>[0]
  ) => permissions?.withoutPermission(permission) ?? false;

  const navLinks: (NavLink | null)[] = [
    {
      title: t('sidebar_tabs.overview'),
      href: `/${personalOrWsId}`,
      icon: <LayoutDashboard className="h-4 w-4" />,
      matchExact: true,
    },
    null,
    {
      title: t('sidebar_tabs.transactions'),
      href: `/${personalOrWsId}/transactions`,
      icon: <CreditCard className="h-4 w-4" />,
      matchExact: true,
      disabled: withoutPermission('view_transactions'),
    },
    {
      title: t('sidebar_tabs.wallets'),
      href: `/${personalOrWsId}/wallets`,
      icon: <Wallet className="h-4 w-4" />,
      disabled: withoutPermission('view_transactions'),
    },
    {
      title: t('sidebar_tabs.invoices'),
      href: `/${personalOrWsId}/invoices`,
      icon: <FileText className="h-4 w-4" />,
      disabled: withoutPermission('view_invoices'),
    },
    null,
    {
      title: t('sidebar_tabs.categories'),
      href: `/${personalOrWsId}/categories`,
      icon: <Receipt className="h-4 w-4" />,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('sidebar_tabs.tags'),
      href: `/${personalOrWsId}/tags`,
      icon: <Tags className="h-4 w-4" />,
      disabled: withoutPermission('manage_finance'),
    },
    null,
    {
      title: t('sidebar_tabs.recurring'),
      href: `/${personalOrWsId}/recurring`,
      icon: <Repeat className="h-4 w-4" />,
      disabled: withoutPermission('view_transactions'),
    },
    {
      title: t('sidebar_tabs.budgets'),
      href: `/${personalOrWsId}/budgets`,
      icon: <ChartColumn className="h-4 w-4" />,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('sidebar_tabs.analytics'),
      href: `/${personalOrWsId}/analytics`,
      icon: <ChartArea className="h-4 w-4" />,
      disabled: withoutPermission('manage_finance'),
    },
    {
      title: t('sidebar_tabs.debts'),
      href: `/${personalOrWsId}/debts`,
      icon: <HandCoins className="h-4 w-4" />,
      disabled: withoutPermission('view_transactions'),
    },
    null,
    createWorkspaceMembersNavLink(t),
  ];

  return navLinks;
}
