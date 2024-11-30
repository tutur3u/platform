import { NavLink, Navigation } from '@/components/navigation';
import { verifySecret } from '@/lib/workspace-helper';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import React from 'react';

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
      title: t('workspace-education-tabs.quizzes'),
      href: `/${wsId}/education/quizzes`,
    },
    {
      title: t('workspace-education-tabs.flashcards'),
      href: `/${wsId}/education/flashcards`,
    },
  ];

  return (
    <div>
      <Navigation navLinks={navLinks} />
      {children}
    </div>
  );
}
