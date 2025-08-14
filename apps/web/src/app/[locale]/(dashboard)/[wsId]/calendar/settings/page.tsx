import { GradientHeadline } from '@tuturuuu/ui/custom/gradient-headline';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function CalendarSettingsPage({ params }: PageProps) {
  const t = await getTranslations('common');
  const { wsId } = await params;
  const workspace = await getWorkspace(wsId);

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('manage_calendar')) redirect(`/${wsId}`);
  if (!workspace) return null;

  return (
    <div className="flex h-screen w-full items-center justify-center text-2xl font-bold lg:text-4xl xl:text-5xl">
      <GradientHeadline>{t('coming_soon')} ✨</GradientHeadline>
    </div>
  );
}
