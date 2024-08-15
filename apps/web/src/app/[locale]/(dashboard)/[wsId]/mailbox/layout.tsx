import { NavLink, Navigation } from '@/components/navigation';
import { getTranslations } from 'next-intl/server';
import React from 'react';

interface LayoutProps {
  params: {
    wsId?: string;
  };
  children: React.ReactNode;
}

export default async function Layout({
  children,
  params: { wsId },
}: LayoutProps) {
  const t = await getTranslations();

  const navLinks: NavLink[] = [
    {
      title: t('workspace-mailbox.overview'),
      href: `/${wsId}/mailbox`,
      matchExact: true,
      disabled: true,
    },
    {
      title: t('workspace-mailbox.send'),
      href: `/${wsId}/mailbox/send`,
    },
    {
      title: t('workspace-mailbox.history'),
      href: `/${wsId}/mailbox/history`,
      disabled: true,
    },
    {
      title: t('dworkspace-mailbox.destination-addresses'),
      href: `/${wsId}/mailbox/destination-addresses`,
      disabled: true,
    },
  ];

  return (
    <div>
      <Navigation navLinks={navLinks} />
      {children}
    </div>
  );
}
