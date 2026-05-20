import { BrainCircuit } from '@tuturuuu/icons';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { getTranslations } from 'next-intl/server';

export type { NavLink } from '@tuturuuu/ui/custom/navigation';

export async function getNavigationLinks({
  workspaceSlug,
}: {
  workspaceSlug: string;
}): Promise<(NavLink | null)[]> {
  const t = await getTranslations('mind');

  return [
    {
      title: t('appName'),
      href: `/${workspaceSlug}`,
      icon: <BrainCircuit className="h-4 w-4" />,
      matchExact: false,
    },
  ];
}
