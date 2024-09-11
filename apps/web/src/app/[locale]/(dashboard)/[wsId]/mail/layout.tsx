import { type NavLink, Navigation } from '@/components/navigation';
import { getTranslations } from 'next-intl/server';
import type React from 'react';

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
      title: t('sidebar_tabs.mail'),
      href: `/${wsId}/mail`,
      matchExact: true,
      requireRootWorkspace: true,
    },
    {
      title: t('workspace-mail.posts'),
      href: `/${wsId}/mail/posts`,
    },
    {
      title: t('workspace-mail.send'),
      href: `/${wsId}/mail/send`,
      disabled: true,
    },
    {
      title: t('workspace-mail.history'),
      href: `/${wsId}/mail/history`,
      // disabled: true,
    },
    {
      title: t('dworkspace-mail.destination-addresses'),
      href: `/${wsId}/mail/destination-addresses`,
      disabled: true,
    },
  ];

  return (
    <div>
      <Navigation navLinks={navLinks} currentWsId={wsId} />
      {children}
    </div>
  );
}
