import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import type React from 'react';
import { Navigation, type NavLink } from '@/components/navigation';
import { requireDatasetAccess } from '@/lib/datasets/page-access';

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
  await connection();

  const { wsId, datasetId } = await params;
  const t = await getTranslations();

  await requireDatasetAccess(wsId, datasetId);

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
      title: 'API References',
      href: `/${wsId}/datasets/${datasetId}/api-references`,
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
