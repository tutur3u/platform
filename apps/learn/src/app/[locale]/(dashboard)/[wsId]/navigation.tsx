import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  HeartPulse,
  Home,
  LineChart,
  MessageCircle,
  Settings,
} from '@tuturuuu/icons';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { getTranslations } from 'next-intl/server';

export async function getNavigationLinks(wsId: string): Promise<NavLink[]> {
  const t = await getTranslations('navigation');
  const base = `/${wsId}`;

  return [
    {
      title: t('home'),
      href: base,
      icon: <Home className="size-4" />,
      matchExact: true,
    },
    {
      title: t('practice'),
      href: `${base}/practice`,
      icon: <HeartPulse className="size-4" />,
    },
    {
      title: t('aiChat'),
      href: `${base}/ai-chat`,
      icon: <MessageCircle className="size-4" />,
    },
    {
      title: t('courses'),
      href: `${base}/courses`,
      icon: <BookOpen className="size-4" />,
    },
    {
      title: t('assignments'),
      href: `${base}/assignments`,
      icon: <ClipboardCheck className="size-4" />,
    },
    {
      title: t('reports'),
      href: `${base}/reports`,
      icon: <LineChart className="size-4" />,
    },
    {
      title: t('marks'),
      href: `${base}/marks`,
      icon: <BarChart3 className="size-4" />,
    },
    {
      title: t('settings'),
      href: `${base}/settings`,
      icon: <Settings className="size-4" />,
    },
  ];
}
