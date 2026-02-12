import {
  CreditCard,
  FileText,
  LayoutDashboard,
  Receipt,
  Tags,
  Wallet,
} from '@tuturuuu/icons';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { getTranslations } from 'next-intl/server';

export type { NavLink } from '@tuturuuu/ui/custom/navigation';

export async function getNavigationLinks({
  personalOrWsId,
}: {
  personalOrWsId: string;
}): Promise<(NavLink | null)[]> {
  const t = await getTranslations();

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
    },
    {
      title: t('sidebar_tabs.wallets'),
      href: `/${personalOrWsId}/wallets`,
      icon: <Wallet className="h-4 w-4" />,
    },
    {
      title: t('sidebar_tabs.invoices'),
      href: `/${personalOrWsId}/invoices`,
      icon: <FileText className="h-4 w-4" />,
    },
    null,
    {
      title: t('sidebar_tabs.categories'),
      href: `/${personalOrWsId}/categories`,
      icon: <Receipt className="h-4 w-4" />,
    },
    {
      title: t('sidebar_tabs.tags'),
      href: `/${personalOrWsId}/tags`,
      icon: <Tags className="h-4 w-4" />,
    },
    // null,
    // {
    //   title: t('sidebar_tabs.recurring'),
    //   href: `/${personalOrWsId}/recurring`,
    //   icon: <Repeat className="h-4 w-4" />,
    // },
    // {
    //   title: t('sidebar_tabs.budgets'),
    //   href: `/${personalOrWsId}/budgets`,
    //   icon: <Target className="h-4 w-4" />,
    // },
    // {
    //   title: t('sidebar_tabs.analytics'),
    //   href: `/${personalOrWsId}/analytics`,
    //   icon: <BarChart3 className="h-4 w-4" />,
    // },
    // {
    //   title: t('sidebar_tabs.debts'),
    //   href: `/${personalOrWsId}/debts`,
    //   icon: <HandCoins className="h-4 w-4" />,
    // },
  ];

  return navLinks;
}
