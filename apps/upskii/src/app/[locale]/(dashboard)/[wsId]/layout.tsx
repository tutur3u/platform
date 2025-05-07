import InvitationCard from '@/app/[locale]/(dashboard)/_components/invitation-card';
import { Structure } from '@/components/layout/structure';
import NavbarActions from '@/components/navbar-actions';
import type { NavLink } from '@/components/navigation';
import { UserNav } from '@/components/user-nav';
import {
  MAIN_CONTENT_SIZE_COOKIE_NAME,
  SIDEBAR_COLLAPSED_COOKIE_NAME,
  SIDEBAR_SIZE_COOKIE_NAME,
} from '@/constants/common';
import {
  getPermissions,
  getWorkspace,
  verifySecret,
} from '@/lib/workspace-helper';
import {
  Award,
  BookText,
  Bot,
  Cog,
  Home,
  ListTodo,
  MessageCircleMore,
  ShieldCheck,
} from '@tuturuuu/ui/icons';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ReactNode, Suspense } from 'react';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: ReactNode;
}

export default async function Layout({ children, params }: LayoutProps) {
  const t = await getTranslations();
  const { wsId } = await params;

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  const ENABLE_AI_ONLY = await verifySecret({
    forceAdmin: true,
    wsId,
    name: 'ENABLE_AI_ONLY',
    value: 'true',
  });

  const navLinks: (NavLink | null)[] = [
    // {
    //   title: t('sidebar_tabs.education'),
    //   href: `/${wsId}/education`,
    //   icon: <GraduationCap className="h-4 w-4" />,
    //   disabled:
    //     ENABLE_AI_ONLY ||
    //     !(await verifySecret({
    //       forceAdmin: true,
    //       wsId,
    //       name: 'ENABLE_EDUCATION',
    //       value: 'true',
    //     })) ||
    //     withoutPermission('ai_lab'),
    //   shortcut: 'A',
    //   experimental: 'beta',
    // },
    {
      title: t('sidebar.home'),
      href: `/${wsId}/home`,
      icon: <Home className="h-4 w-4" />,
      experimental: 'alpha',
      shortcut: 'H',
      disabled:
        ENABLE_AI_ONLY ||
        !(await verifySecret({
          forceAdmin: true,
          wsId,
          name: 'ENABLE_EDUCATION',
          value: 'true',
        })) ||
        withoutPermission('ai_lab'),
    },
    {
      title: t('sidebar.courses'),
      href: `/${wsId}/courses`,
      icon: <BookText className="h-4 w-4" />,
      experimental: 'alpha',
      shortcut: 'C',
      disabled:
        ENABLE_AI_ONLY ||
        !(await verifySecret({
          forceAdmin: true,
          wsId,
          name: 'ENABLE_EDUCATION',
          value: 'true',
        })) ||
        withoutPermission('ai_lab'),
    },
    {
      title: t('sidebar.quizzes'),
      href: `/${wsId}/quizzes`,
      icon: <ListTodo className="h-4 w-4" />,
      experimental: 'alpha',
      shortcut: 'Q',
      disabled:
        ENABLE_AI_ONLY ||
        !(await verifySecret({
          forceAdmin: true,
          wsId,
          name: 'ENABLE_EDUCATION',
          value: 'true',
        })) ||
        withoutPermission('ai_lab'),
    },
    {
      title: t('sidebar.certificates'),
      href: `/${wsId}/certificate/CERT-2024-03-15-a1b2c3d4-e5f6-4321-9876-123456789abc`, // TODO: Replace with dynamic certificate ID
      icon: <Award className="h-4 w-4" />,
      experimental: 'alpha',
      shortcut: 'Q',
      disabled:
        ENABLE_AI_ONLY ||
        !(await verifySecret({
          forceAdmin: true,
          wsId,
          name: 'ENABLE_EDUCATION',
          value: 'true',
        })) ||
        withoutPermission('ai_lab'),
    },
    {
      title: t('sidebar.ai_chat'),
      href: `/${wsId}/ai-chat`,
      icon: <Bot className="h-4 w-4" />,
      experimental: 'alpha',
      shortcut: 'M',
      disabled:
        ENABLE_AI_ONLY ||
        !(await verifySecret({
          forceAdmin: true,
          wsId,
          name: 'ENABLE_EDUCATION',
          value: 'true',
        })) ||
        withoutPermission('ai_lab'),
    },
    {
      title: t('sidebar.chat'),
      href: `/${wsId}/chat`,
      icon: <MessageCircleMore className="h-4 w-4" />,
      experimental: 'alpha',
      shortcut: 'M',
      disabled:
        ENABLE_AI_ONLY ||
        !(await verifySecret({
          forceAdmin: true,
          wsId,
          name: 'ENABLE_EDUCATION',
          value: 'true',
        })) ||
        withoutPermission('ai_lab'),
    },
    {
      title: t('sidebar.roles'),
      href: `/${wsId}/roles`,
      // subItems: [] as { name: string; href: string }[],
      icon: <ShieldCheck className="h-4 w-4" />,
      experimental: 'alpha',
      shortcut: 'R',
      disabled:
        ENABLE_AI_ONLY ||
        !(await verifySecret({
          forceAdmin: true,
          wsId,
          name: 'ENABLE_EDUCATION',
          value: 'true',
        })) ||
        withoutPermission('ai_lab'),
    },

    null,
    {
      title: t('common.settings'),
      href: `/${wsId}/settings`,
      icon: <Cog className="h-4 w-4" />,
      aliases: [
        `/${wsId}/members`,
        `/${wsId}/teams`,
        `/${wsId}/secrets`,
        `/${wsId}/infrastructure`,
        `/${wsId}/migrations`,
        `/${wsId}/activities`,
      ],
      shortcut: ',',
    },
  ];

  const workspace = await getWorkspace(wsId);
  const user = await getCurrentUser();

  const sidebarSize = (await cookies()).get(SIDEBAR_SIZE_COOKIE_NAME);
  const mainSize = (await cookies()).get(MAIN_CONTENT_SIZE_COOKIE_NAME);

  const collapsed = (await cookies()).get(SIDEBAR_COLLAPSED_COOKIE_NAME);

  const defaultLayout =
    sidebarSize !== undefined && mainSize !== undefined
      ? [JSON.parse(sidebarSize.value), JSON.parse(mainSize.value)]
      : undefined;

  const defaultCollapsed = collapsed ? JSON.parse(collapsed.value) : undefined;

  if (!workspace) redirect('/onboarding');
  if (!workspace?.joined)
    return (
      <div className="flex h-screen w-screen items-center justify-center p-2 md:p-4">
        <InvitationCard workspace={workspace} />
      </div>
    );

  return (
    <Structure
      wsId={wsId}
      user={user}
      workspace={workspace}
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
      {children}
    </Structure>
  );
}
