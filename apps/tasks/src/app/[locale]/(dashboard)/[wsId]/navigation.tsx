import {
  BarChart3,
  Bookmark,
  Box,
  FileEdit,
  Goal,
  hexagons3,
  Icon,
  Logs,
  NotepadText,
  Repeat,
  Sparkle,
  SquareKanban,
  Tags,
  TrendingUp,
  Trophy,
  Upload,
  UserStar,
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
      title: t('sidebar_tabs.tasks'),
      href: `/${personalOrWsId}/tasks`,
      icon: <UserStar className="h-4 w-4" />,
      matchExact: true,
    },
    null,
    {
      title: t('sidebar_tabs.habits'),
      href: `/${personalOrWsId}/habits`,
      icon: <Repeat className="h-4 w-4" />,
      requireRootMember: true,
    },
    {
      title: t('sidebar_tabs.notes'),
      href: `/${personalOrWsId}/notes`,
      icon: <NotepadText className="h-4 w-4" />,
    },
    {
      title: t('sidebar_tabs.drafts'),
      href: `/${personalOrWsId}/drafts`,
      icon: <FileEdit className="h-4 w-4" />,
    },
    null,
    {
      title: t('sidebar_tabs.boards'),
      href: `/${personalOrWsId}/boards`,
      icon: <SquareKanban className="h-4 w-4" />,
    },
    null,
    {
      title: t('sidebar_tabs.initiatives'),
      href: `/${personalOrWsId}/initiatives`,
      icon: <Sparkle className="h-4 w-4" />,
      matchExact: true,
    },
    {
      title: t('sidebar_tabs.projects'),
      href: `/${personalOrWsId}/projects`,
      icon: <Box className="h-4 w-4" />,
    },
    null,
    // {
    //   title: t('sidebar_tabs.cycles'),
    //   href: `/${personalOrWsId}/cycles`,
    //   icon: <RotateCcw className="h-4 w-4" />,
    // },
    {
      title: t('sidebar_tabs.labels'),
      href: `/${personalOrWsId}/labels`,
      icon: <Tags className="h-4 w-4" />,
    },
    {
      title: t('sidebar_tabs.templates'),
      href: `/${personalOrWsId}/templates`,
      icon: <Bookmark className="h-4 w-4" />,
    },
    {
      title: t('sidebar_tabs.estimates'),
      icon: <Icon iconNode={hexagons3} className="h-4 w-4" />,
      href: `/${personalOrWsId}/estimates`,
    },
    null,
    {
      title: t('sidebar_tabs.progress'),
      href: `/${personalOrWsId}/progress`,
      icon: <TrendingUp className="h-4 w-4" />,
      requireRootMember: true,
    },
    {
      title: t('sidebar_tabs.goals'),
      href: `/${personalOrWsId}/goals`,
      icon: <Goal className="h-4 w-4" />,
      requireRootMember: true,
    },
    {
      title: t('sidebar_tabs.stats'),
      href: `/${personalOrWsId}/stats`,
      icon: <BarChart3 className="h-4 w-4" />,
      requireRootMember: true,
    },
    {
      title: t('sidebar_tabs.leaderboards'),
      href: `/${personalOrWsId}/leaderboards`,
      icon: <Trophy className="h-4 w-4" />,
      requireRootMember: true,
    },
    {
      title: t('common.import'),
      href: `/${personalOrWsId}/import`,
      icon: <Upload className="h-4 w-4" />,
      requireRootMember: true,
    },
    null,
    {
      title: t('sidebar_tabs.logs'),
      href: `/${personalOrWsId}/logs`,
      icon: <Logs className="h-4 w-4" />,
    },
  ];

  return navLinks;
}
