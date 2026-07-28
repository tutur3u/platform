import {
  Activity,
  BarChart3,
  Bot,
  ClipboardList,
  Coins,
  Cpu,
  History,
  LayoutDashboard,
  Lock,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Workflow,
} from '@tuturuuu/icons';
import { createWorkspaceMembersNavLink } from '@tuturuuu/satellite/workspace-settings';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { getTranslations } from 'next-intl/server';

export async function getNavigationLinks({
  canManageAiKeys,
  personalOrWsId,
}: {
  canManageAiKeys: boolean;
  personalOrWsId: string;
}): Promise<(NavLink | null)[]> {
  const [t, common] = await Promise.all([
    getTranslations('ai-studio'),
    getTranslations(),
  ]);
  const href = (section?: string) =>
    `/${personalOrWsId}${section ? `/${section}` : ''}`;

  return [
    {
      title: t('overview'),
      href: href(),
      icon: <LayoutDashboard className="h-4 w-4" />,
      matchExact: true,
    },
    {
      title: t('build'),
      icon: <Sparkles className="h-4 w-4" />,
      children: [
        {
          title: t('playground'),
          href: href('playground'),
          icon: <Sparkles className="h-4 w-4" />,
        },
        {
          title: t('prompts'),
          href: href('prompts'),
          icon: <MessageSquare className="h-4 w-4" />,
        },
        {
          title: t('agents'),
          href: href('agents'),
          icon: <Bot className="h-4 w-4" />,
        },
        {
          title: t('datasets'),
          href: href('datasets'),
          icon: <ClipboardList className="h-4 w-4" />,
        },
        {
          title: t('evaluations'),
          href: href('evaluations'),
          icon: <ShieldCheck className="h-4 w-4" />,
        },
        {
          title: t('experiments'),
          href: href('experiments'),
          icon: <Workflow className="h-4 w-4" />,
        },
      ],
    },
    {
      title: t('governance'),
      icon: <Lock className="h-4 w-4" />,
      children: [
        ...(canManageAiKeys
          ? [
              {
                title: t('api-keys'),
                href: href('api-keys'),
                icon: <Lock className="h-4 w-4" />,
              },
            ]
          : []),
        {
          title: t('model-policy'),
          href: href('model-policy'),
          icon: <Cpu className="h-4 w-4" />,
        },
      ],
    },
    {
      title: t('observe'),
      icon: <Activity className="h-4 w-4" />,
      children: [
        {
          title: t('runs'),
          href: href('runs'),
          icon: <Activity className="h-4 w-4" />,
        },
        {
          title: t('logs'),
          href: href('logs'),
          icon: <History className="h-4 w-4" />,
        },
        {
          title: t('usage'),
          href: href('usage'),
          icon: <BarChart3 className="h-4 w-4" />,
        },
        {
          title: t('credits'),
          href: href('credits'),
          icon: <Coins className="h-4 w-4" />,
        },
      ],
    },
    null,
    createWorkspaceMembersNavLink(common),
  ];
}
