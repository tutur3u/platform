import NavbarActions from '../navbar-actions';
import { UserNav } from '../user-nav';
import { getChats } from './helper';
import { Structure } from './structure';
import { NavLink } from '@/components/navigation';
import { getCurrentUser } from '@/lib/user-helper';
import { MessageSquare } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import React, { Suspense } from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export default async function Layout({ children }: LayoutProps) {
  const t = await getTranslations();
  const user = await getCurrentUser();
  const { data: chats } = await getChats();

  const navLinks = chats.map((chat) => ({
    title: chat.title || t('common.untitled'),
    icon: <MessageSquare className="flex-none" />,
    href: `/c/${chat.id}`,
  })) satisfies NavLink[];

  const layout = cookies().get('react-resizable-panels:layout:mail');
  const collapsed = cookies().get('react-resizable-panels:collapsed');

  const defaultLayout = layout ? JSON.parse(layout.value) : undefined;
  const defaultCollapsed = collapsed ? JSON.parse(collapsed.value) : undefined;

  return (
    <div className="flex h-screen max-h-screen min-h-screen flex-col overflow-y-auto">
      <Structure
        user={user}
        defaultLayout={defaultLayout}
        defaultCollapsed={defaultCollapsed}
        navCollapsedSize={4}
        links={navLinks}
        actions={
          <Suspense
            fallback={
              <div className="bg-foreground/5 h-10 w-[88px] animate-pulse rounded-lg" />
            }
          >
            <NavbarActions />
          </Suspense>
        }
        userPopover={
          <Suspense
            fallback={
              <div className="bg-foreground/5 h-10 w-10 animate-pulse rounded-lg" />
            }
          >
            <UserNav hideMetadata />
          </Suspense>
        }
      >
        <div id="main-content">{children}</div>
      </Structure>
    </div>
  );
}
