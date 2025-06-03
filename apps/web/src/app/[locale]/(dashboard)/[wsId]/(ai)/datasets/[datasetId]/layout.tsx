import { NavLink, Navigation } from '@/components/navigation';
import { createClient } from '@ncthub/supabase/next/server';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
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

  const supabase = await createClient();

  const { data: dataset } = await supabase
    .from('workspace_datasets')
    .select('*')
    .eq('id', datasetId)
    .maybeSingle();

  if (!dataset) notFound();

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
