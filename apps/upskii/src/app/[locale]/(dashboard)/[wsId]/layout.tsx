import {
  Award,
  Bolt,
  BookCopy,
  BookKey,
  BookOpenText,
  BookText,
  Bot,
  ClipboardCheck,
  Cog,
  CopyCheck,
  Home,
  Library,
  ListTodo,
  ShieldUser,
  SquareTerminal,
  UserCog,
  Users,
} from '@tuturuuu/ui/icons';
import {
  getFeatureFlags,
  isAnyEducationFeatureEnabled,
  requireFeatureFlags,
} from '@tuturuuu/utils/feature-flags/core';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { type ReactNode, Suspense } from 'react';
import InvitationCard from '@/app/[locale]/(dashboard)/_components/invitation-card';
import { Structure } from '@/components/layout/structure';
import NavbarActions from '@/components/navbar-actions';
import type { NavLink } from '@/components/navigation';
import { EducationBanner } from '@/components/request-education-banner';
import { UserNav } from '@/components/user-nav';
import { SIDEBAR_COLLAPSED_COOKIE_NAME } from '@/constants/common';

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

  const { ENABLE_AI, ENABLE_EDUCATION, ENABLE_QUIZZES, ENABLE_CHALLENGES } =
    await requireFeatureFlags(wsId, {
      requiredFlags: [
        'ENABLE_AI',
        'ENABLE_EDUCATION',
        'ENABLE_QUIZZES',
        'ENABLE_CHALLENGES',
      ],
      redirectTo: null,
    });

  const navLinks: (NavLink | null)[] = [
    {
      title: t('sidebar.home'),
      href: `/${wsId}/home`,
      icon: <Home className="h-4 w-4" />,
      matchExact: true,
      shortcut: 'H',
      disabled: !ENABLE_EDUCATION || withoutPermission('ai_lab'),
    },
    null,
    {
      title: t('sidebar_tabs.learning'),
      icon: <BookText className="h-4 w-4" />,
      children: [
        {
          title: t('sidebar.courses'),
          href: `/${wsId}/courses`,
          icon: <BookCopy className="h-4 w-4" />,
          shortcut: 'C',
          disabled: !ENABLE_EDUCATION || withoutPermission('ai_lab'),
        },
        {
          title: t('sidebar.quizzes'),
          href: `/${wsId}/quizzes`,
          icon: <CopyCheck className="h-4 w-4" />,
          shortcut: 'Q',
          disabled: !ENABLE_QUIZZES || withoutPermission('ai_lab'),
        },
        {
          title: t('sidebar.quiz-sets'),
          href: `/${wsId}/quiz-sets`,
          icon: <ListTodo className="h-4 w-4" />,
          shortcut: 'S',
          disabled: !ENABLE_QUIZZES || withoutPermission('ai_lab'),
        },
        {
          title: t('sidebar.challenges'),
          href: `/${wsId}/challenges`,
          icon: <SquareTerminal className="h-4 w-4" />,
          shortcut: 'L',
          disabled: !ENABLE_CHALLENGES || withoutPermission('ai_lab'),
        },
        {
          title: t('sidebar.certificates'),
          href: `/${wsId}/certificates`,
          icon: <Award className="h-4 w-4" />,
          shortcut: 'Q',
          disabled: !ENABLE_EDUCATION || withoutPermission('ai_lab'),
        },
      ],
    },
    {
      title: t('sidebar_tabs.teaching'),
      icon: <Library className="h-4 w-4" />,
      children: [
        {
          title: t('sidebar.ai_teach_studio'),
          href: `/${wsId}/ai-teach-studio`,
          icon: <BookOpenText className="h-4 w-4" />,
          shortcut: 'T',
          disabled: !ENABLE_AI || withoutPermission('ai_lab'),
        },
        {
          title: t('sidebar.ai_chat'),
          href: `/${wsId}/ai-chat`,
          icon: <Bot className="h-4 w-4" />,
          shortcut: 'M',
          disabled: !ENABLE_AI || withoutPermission('ai_lab'),
        },
      ],
    },
    null,
    {
      title: t('common.settings'),
      icon: <Cog className="h-4 w-4" />,
      aliases: [
        `/${wsId}/members`,
        `/${wsId}/roles`,
        `/${wsId}/secrets`,
        `/${wsId}/approvals`,
      ],
      shortcut: ',',
      children: [
        {
          title: t('workspace-settings-layout.workspace'),
          href: `/${wsId}/settings`,
          icon: <Bolt className="h-4 w-4" />,
        },
        {
          title: t('workspace-settings-layout.members'),
          href: `/${wsId}/members`,
          icon: <Users className="h-4 w-4" />,
          disabled: withoutPermission('manage_workspace_members'),
        },
        {
          title: t('workspace-settings-layout.roles'),
          href: `/${wsId}/roles`,
          icon: <ShieldUser className="h-4 w-4" />,
          disabled: withoutPermission('manage_workspace_roles'),
        },
        {
          title: t('workspace-settings-layout.secrets'),
          href: `/${wsId}/secrets`,
          icon: <BookKey className="h-4 w-4" />,
          disabled: withoutPermission('manage_workspace_secrets'),
          requireRootMember: true,
        },
        {
          title: t('sidebar.platform_users'),
          href: `/${wsId}/platform/roles`,
          icon: <UserCog className="h-4 w-4" />,
          shortcut: 'U',
          disabled: withoutPermission('ai_lab'),
          requireRootWorkspace: true,
        },
        {
          title: 'Approvals',
          href: `/${wsId}/approvals`,
          icon: <ClipboardCheck className="h-4 w-4" />,
          requireRootWorkspace: true,
        },
      ],
    },
  ];

  const workspace = await getWorkspace(wsId);

  const user = await getCurrentUser();

  // Check if user is workspace owner and education is not enabled
  const isWorkspaceOwner = workspace?.role === 'OWNER';
  const shouldShowBanner =
    isWorkspaceOwner &&
    !(await isAnyEducationFeatureEnabled(wsId)) &&
    workspace?.name;

  const collapsed = (await cookies()).get(SIDEBAR_COLLAPSED_COOKIE_NAME);

  const defaultCollapsed = collapsed ? JSON.parse(collapsed.value) : undefined;

  const featureFlags = await getFeatureFlags(wsId);

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
      defaultCollapsed={defaultCollapsed}
      links={navLinks}
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
      {shouldShowBanner && (
        <div className="mb-6">
          <EducationBanner
            workspaceName={workspace.name}
            wsId={wsId}
            enabledFeatures={featureFlags}
          />
        </div>
      )}
      {children}
    </Structure>
  );
}
