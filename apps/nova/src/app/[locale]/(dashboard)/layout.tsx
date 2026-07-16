import {
  Activity,
  Box,
  Calculator,
  Code,
  Home,
  List,
  Trophy,
  User,
  Users,
} from '@tuturuuu/icons';
import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { type ReactNode, Suspense } from 'react';
import Structure from '@/components/layout/structure';
import { SIDEBAR_COLLAPSED_COOKIE_NAME } from '@/constants/common';
import {
  requireNovaAppSessionUser,
  requireNovaEnabledRole,
} from '@/lib/app-session';
import NavbarActions from '../(marketing)/navbar-actions';
import { UserNav } from '../(marketing)/user-nav';

export const metadata: Metadata = {
  robots: NO_INDEX_ROBOTS,
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getTranslations('nova');
  const user = await requireNovaAppSessionUser();
  const whitelisted = await requireNovaEnabledRole(user);

  const collapsed = (await cookies()).get(SIDEBAR_COLLAPSED_COOKIE_NAME);

  const defaultCollapsed = collapsed ? JSON.parse(collapsed.value) : undefined;

  const navItems = [
    {
      name: t('home'),
      href: '/home',
      icon: <Home className="h-4 w-4" />,
    },
    {
      name: t('challenges'),
      href: '/challenges',
      icon: <Code className="h-4 w-4" />,
    },
    {
      name: t('problems'),
      href: '/problems',
      icon: <List className="h-4 w-4" />,
      requiresChallengeManagement: true,
    },
    {
      name: t('sessions'),
      href: '/sessions',
      icon: <Activity className="h-4 w-4" />,
      requiresChallengeManagement: true,
    },
    {
      name: t('submissions'),
      href: '/submissions',
      icon: <Box className="h-4 w-4" />,
      requiresChallengeManagement: true,
    },
    {
      name: t('leaderboard'),
      href: '/leaderboard',
      icon: <Trophy className="h-4 w-4" />,
    },
    {
      name: t('score-calculator'),
      href: '/score-calculator',
      icon: <Calculator className="h-4 w-4" />,
    },
    {
      name: t('users'),
      href: '/users',
      subItems: [] as { name: string; href: string }[],
      icon: <User className="h-4 w-4" />,
      requiresRoleManagement: true,
    },
    {
      name: t('teams'),
      href: '/teams',
      icon: <Users className="h-4 w-4" />,
      requiresRoleManagement: true,
    },
  ];

  return (
    <Structure
      allowChallengeManagement={
        whitelisted?.allow_challenge_management || false
      }
      allowRoleManagement={whitelisted?.allow_role_management || false}
      defaultCollapsed={defaultCollapsed}
      navItems={navItems}
      actions={
        <Suspense
          fallback={
            <div className="h-10 w-[88px] animate-pulse rounded-lg bg-foreground/5" />
          }
        >
          <NavbarActions />
        </Suspense>
      }
      userPopover={
        <Suspense
          fallback={
            <div className="h-10 w-10 animate-pulse rounded-lg bg-foreground/5" />
          }
        >
          <UserNav hideMetadata />
        </Suspense>
      }
    >
      {/* <ApologyModal /> */}
      {children}
    </Structure>
  );
}
