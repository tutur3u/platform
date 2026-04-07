import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import WorkspaceWrapper from '@/components/workspace-wrapper';
import { isHabitsEnabled } from '@/lib/habits/access';
import HabitsClientPage from './page-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('habit-tracker.metadata');

  return {
    title: t('title'),
    description: t('description'),
  };
}

export default async function HabitsPage({
  params,
}: {
  params: Promise<{ locale: string; wsId: string }>;
}) {
  const { wsId } = await params;

  if (!(await isHabitsEnabled(wsId))) {
    notFound();
  }

  return (
    <WorkspaceWrapper params={params}>
      {async ({ wsId }) => <HabitsClientPage wsId={wsId} />}
    </WorkspaceWrapper>
  );
}
