import { verifySecret } from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type React from 'react';
import { Navigation, type NavLink } from '@/components/navigation';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: React.ReactNode;
}

export default async function Layout({ children, params }: LayoutProps) {
  const t = await getTranslations();
  const { wsId } = await params;

  if (
    !(await verifySecret({
      forceAdmin: true,
      wsId,
      name: 'ENABLE_EDUCATION',
      value: 'true',
    }))
  )
    redirect(`/${wsId}`);

  const navLinks: NavLink[] = [
    {
      title: t('workspace-education-tabs.overview'),
      href: `/${wsId}/education`,
      matchExact: true,
    },
    {
      title: t('workspace-education-tabs.courses'),
      href: `/${wsId}/education/courses`,
    },
    {
      title: t('workspace-education-tabs.quiz-sets'),
      href: `/${wsId}/education/quiz-sets`,
    },
    {
      title: t('workspace-education-tabs.quizzes'),
      href: `/${wsId}/education/quizzes`,
    },
    {
      title: t('workspace-education-tabs.flashcards'),
      href: `/${wsId}/education/flashcards`,
    },
    {
      title: t('workspace-education-tabs.attempts'),
      href: `/${wsId}/education/attempts`,
    },
  ];

  return (
    <div>
      <Navigation navLinks={navLinks} />
      {children}
    </div>
  );
}
