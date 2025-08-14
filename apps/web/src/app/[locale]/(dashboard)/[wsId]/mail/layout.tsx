import {
  getPermissions,
  getSecrets,
  getWorkspace,
} from '@tuturuuu/utils/workspace-helper';
import { redirect } from 'next/navigation';
import type React from 'react';

interface LayoutProps {
  params: Promise<{
    wsId: string;
  }>;
  children: React.ReactNode;
}

export default async function Layout({ children, params }: LayoutProps) {
  const { wsId: id } = await params;
  const workspace = await getWorkspace(id);
  const wsId = workspace?.id;

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

  return children;
}
