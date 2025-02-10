import NavbarActions from '../navbar-actions';
import { UserNav } from '../user-nav';
import { getChats } from './helper';
import { Structure } from './structure';
import { NavLink } from '@/components/navigation';
import { getCurrentUser } from '@/lib/user-helper';
import { createAdminClient } from '@tutur3u/supabase/next/server';
import { MessageSquare } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { cookies as c } from 'next/headers';
import React, { Suspense } from 'react';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function Layout({ children, params }: LayoutProps) {
  const { locale } = await params;

  const t = await getTranslations();
  const user = await getCurrentUser();
  const { data: chats } = await getChats();

  const adminSb = await createAdminClient();

  if (user?.email) {
    const { data: whitelisted, error } = await adminSb
      .from('ai_whitelisted_emails')
      .select('enabled')
      .eq('email', user?.email)
      .maybeSingle();

    if (error || !whitelisted?.enabled) return children;
  }

  const navLinks = chats.map((chat) => ({
    title: chat.title || t('common.untitled'),
    icon: <MessageSquare className="flex-none" />,
    href: `/c/${chat.id}`,
    pinned: chat.pinned,
    createdAt: chat.created_at,
  })) satisfies NavLink[];

  const cookies = await c();

  const layout = cookies.get('react-resizable-panels:layout:rewise');
  const collapsed = cookies.get('react-resizable-panels:collapsed');

  const defaultLayout = layout ? JSON.parse(layout.value) : undefined;
  const defaultCollapsed = collapsed ? JSON.parse(collapsed.value) : undefined;

  return (
    <div className="from-dynamic-light-red/10 via-dynamic-light-pink/5 to-dynamic-light-blue/10 flex h-screen max-h-screen min-h-screen flex-col overflow-y-auto bg-gradient-to-br">
      {/* <div className="from-dynamic-light-red via-dynamic-light-pink to-dynamic-light-blue absolute -z-20 h-full w-full bg-gradient-to-r" /> */}
      <Structure
        locale={locale}
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
