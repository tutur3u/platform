import { NavLink, Navigation } from '@/components/navigation';
import { getTranslations } from 'next-intl/server';
import React from 'react';

interface LayoutProps {
  params: Promise<{
    wsId: string;
    datasetId: string;
  }>;
  children: React.ReactNode;
}

export default async function DatasetDetailsLayout({
  children,
  params,
}: LayoutProps) {
  const { wsId, datasetId } = await params;
  const t = await getTranslations();

  const navLinks: NavLink[] = [
    {
      title: t('common.general'),
      href: `/${wsId}/datasets/${datasetId}`,
      matchExact: true,
    },
    {
      title: t('common.explore'),
      href: `/${wsId}/datasets/${datasetId}/explore`,
    },
    {
      title: t('common.settings'),
      href: `/${wsId}/datasets/${datasetId}/settings`,
    },
  ];

  return (
    <div>
      <Navigation navLinks={navLinks} />
      {children}
    </div>
  );
}
