import { NavLink, Navigation } from '@/components/navigation';
import { getTranslations } from 'next-intl/server';
import React from 'react';

interface LayoutProps {
  params: Promise<{
    wsId: string;
    crawlerId: string;
  }>;
  children: React.ReactNode;
}

export default async function DatasetDetailsLayout({
  children,
  params,
}: LayoutProps) {
  const { wsId, crawlerId } = await params;
  const t = await getTranslations();

  const navLinks: NavLink[] = [
    {
      title: t('common.general'),
      href: `/${wsId}/crawlers/${crawlerId}`,
      matchExact: true,
    },
  ];

  return (
    <div>
      <Navigation navLinks={navLinks} />
      {children}
    </div>
  );
}
