import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { getTranslations } from 'next-intl/server';
import {
  getMailFolderHref,
  MAIL_FOLDERS,
  mailFolderIcons,
} from './mail-folders';

export type { NavLink } from '@tuturuuu/ui/custom/navigation';

export async function getNavigationLinks({
  personalOrWsId,
}: {
  personalOrWsId: string;
}): Promise<(NavLink | null)[]> {
  const t = await getTranslations();

  return MAIL_FOLDERS.map((folder) => {
    const Icon = mailFolderIcons[folder];

    return {
      href: getMailFolderHref(personalOrWsId, folder),
      icon: <Icon className="h-4 w-4" />,
      id: `mail.folder.${folder}`,
      matchExact: true,
      title: t(`mail.${folder}`),
    };
  });
}
