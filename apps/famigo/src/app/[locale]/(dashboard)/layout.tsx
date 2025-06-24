import { createClient } from '@tuturuuu/supabase/next/server';
import {
  Bell,
  Bot,
  Calendar,
  Home,
  MessageCircle,
  Users,
} from '@tuturuuu/ui/icons';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';
import Structure from '@/components/layout/structure';
import { SIDEBAR_COLLAPSED_COOKIE_NAME } from '@/constants/common';
import NavbarActions from '../(marketing)/navbar-actions';
import { UserNav } from '../(marketing)/user-nav';

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) redirect('/login');

  const collapsed = (await cookies()).get(SIDEBAR_COLLAPSED_COOKIE_NAME);

  const defaultCollapsed = collapsed ? JSON.parse(collapsed.value) : undefined;

  const navItems = [
    {
      name: 'Home',
      href: '/home',
      icon: <Home className="h-4 w-4" />,
    },
    {
      name: 'Fami',
      href: '/fami',
      icon: <Bot className="h-4 w-4" />,
    },
    {
      name: 'Chat',
      href: '/chat',
      icon: <MessageCircle className="h-4 w-4" />,
    },
    {
      name: 'Calendar',
      href: '/calendar',
      icon: <Calendar className="h-4 w-4" />,
    },
    {
      name: 'Notifications',
      href: '/notifications',
      icon: <Bell className="h-4 w-4" />,
    },
    {
      name: 'Manage',
      href: '/manage',
      icon: <Users className="h-4 w-4" />,
    },
  ];

  return (
    <Structure
      allowChallengeManagement={false}
      allowRoleManagement={false}
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
