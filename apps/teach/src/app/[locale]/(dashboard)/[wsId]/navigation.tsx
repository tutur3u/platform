import {
  BarChart3,
  BookOpenCheck,
  CalendarCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  Library,
  Settings,
} from '@tuturuuu/icons';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { getTranslations } from 'next-intl/server';

export async function getNavigationLinks(wsId: string): Promise<NavLink[]> {
  const t = await getTranslations('teachShell.nav');
  const base = `/${wsId}`;

  return [
    {
      title: t('dashboard'),
      href: base,
      icon: <GraduationCap className="size-4" />,
      matchExact: true,
    },
    {
      title: t('courses'),
      href: `${base}/courses`,
      aliases: [`${base}/modules`],
      icon: <BookOpenCheck className="size-4" />,
    },
    {
      title: t('attendance'),
      href: `${base}/attendance`,
      icon: <CalendarCheck className="size-4" />,
    },
    {
      title: t('assignments'),
      href: `${base}/assignments`,
      icon: <ClipboardList className="size-4" />,
    },
    {
      title: t('reports'),
      href: `${base}/reports`,
      icon: <FileText className="size-4" />,
    },
    {
      title: t('metrics'),
      href: `${base}/metrics`,
      icon: <BarChart3 className="size-4" />,
    },
    {
      title: t('education'),
      href: `${base}/education`,
      icon: <Library className="size-4" />,
    },
    {
      title: t('settings'),
      href: `${base}/settings`,
      icon: <Settings className="size-4" />,
    },
  ];
}
