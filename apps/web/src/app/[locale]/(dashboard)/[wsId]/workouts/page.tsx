import { GradientHeadline } from '@tuturuuu/ui/custom/gradient-headline';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

export const metadata: Metadata = {
  title: 'Workouts',
  description: 'Manage Workouts in your Tuturuuu workspace.',
};

interface PageProps {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function CalendarPage({ params }: PageProps) {
  const t = await getTranslations('common');
  const { wsId } = await params;
  const workspace = await getWorkspace(wsId);
  if (!workspace) notFound();

  const permissions = await getPermissions({
    wsId,
  });
  if (!permissions) notFound();
  const { withoutPermission } = permissions;

  if (withoutPermission('manage_projects')) redirect(`/${wsId}`);
  if (!workspace) return null;

  return (
    <div className="flex h-screen w-full items-center justify-center font-bold text-2xl lg:text-4xl xl:text-5xl">
      <GradientHeadline>{t('coming_soon')} ✨</GradientHeadline>
    </div>
  );
}
