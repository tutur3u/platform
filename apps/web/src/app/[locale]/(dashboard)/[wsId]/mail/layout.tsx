import { type NavLink, Navigation } from '@/components/navigation';
import { getPermissions, getSecrets } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import type React from 'react';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: React.ReactNode;
}

export default async function Layout({ children, params }: LayoutProps) {
  const t = await getTranslations();
  const { wsId } = await params;

  const secrets = await getSecrets({
    wsId,
    forceAdmin: true,
  });

  if (!secrets.find((secret) => secret.value === 'true')) {
    redirect(`/${wsId}`);
  }

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('send_user_group_post_emails')) redirect(`/${wsId}`);

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
