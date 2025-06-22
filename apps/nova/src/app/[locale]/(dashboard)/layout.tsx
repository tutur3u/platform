import NavbarActions from '../(marketing)/navbar-actions';
import { UserNav } from '../(marketing)/user-nav';
import Structure from '@/components/layout/structure';
import { SIDEBAR_COLLAPSED_COOKIE_NAME } from '@/constants/common';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  Activity,
  Box,
  Calculator,
  Code,
  Home,
  List,
  MessageCircle,
  Trophy,
  User,
  Users,
} from '@tuturuuu/ui/icons';
import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ReactNode, Suspense } from 'react';

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const sbAdmin = await createAdminClient();
  const supabase = await createClient();
  const t = await getTranslations('nova');

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) redirect('/login');

  const { data: whitelisted } = await sbAdmin
    .from('platform_user_roles')
    .select('enabled, allow_challenge_management, allow_role_management')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!whitelisted?.enabled) redirect('/not-whitelisted');

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
      name: t('sidebar_tabs.support'),
      href: '/support',
      icon: <MessageCircle className="h-4 w-4" />,
      subItems: [
        {
          name: t('sidebar_tabs.my_inquiries'),
          href: '/support',
        },
        {
          name: t('sidebar_tabs.all_inquiries'),
          href: '/support/admin',
        },
      ],
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
