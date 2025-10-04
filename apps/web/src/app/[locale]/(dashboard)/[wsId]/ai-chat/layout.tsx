import { getPermissions } from '@tuturuuu/utils/workspace-helper';
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

  const { withoutPermission } = await getPermissions({
    wsId,
  });

  if (withoutPermission('ai_chat')) redirect(`/${wsId}`);

  const navLinks: NavLink[] = [
    {
      title: t('ai_chat.new_chat'),
      href: `/${wsId}/chat/new`,
      aliases: [`/${wsId}/chat`],
      matchExact: true,
      disabled: withoutPermission('ai_chat'),
    },
    {
      title: t('ai_chat.chatbots'),
      href: `/${wsId}/chat/chatbots`,
      requireRootWorkspace: true,
      disabled: withoutPermission('ai_chat'),
    },
    {
      title: t('ai_chat.my_chatbots'),
      href: `/${wsId}/chat/my-chatbots`,
      requireRootWorkspace: true,
      disabled: withoutPermission('ai_chat'),
    },
  ];

  return (
    <div>
      <Navigation currentWsId={wsId} navLinks={navLinks} />
      {children}
    </div>
  );
}
